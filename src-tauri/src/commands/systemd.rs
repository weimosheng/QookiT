use tauri::State;

use crate::error::{AppError, AppResult};
use crate::state::AppState;

#[derive(Clone, Debug, serde::Serialize)]
pub struct SystemdUnit {
    pub name: String,
    pub description: String,
    pub load_state: String,
    pub active_state: String,
    pub sub_state: String,
}

#[derive(Clone, Debug, serde::Serialize)]
pub struct SystemdUnitStatus {
    pub name: String,
    pub description: String,
    pub load_state: String,
    pub active_state: String,
    pub sub_state: String,
    pub unit_file_state: String,
    pub main_pid: u64,
    pub memory_current: u64,
    pub cpu_usage_nsec: u64,
    pub active_enter_timestamp: String,
    pub inactive_enter_timestamp: String,
    pub fragment_path: String,
}

fn validate_unit_name(name: &str) -> AppResult<()> {
    if name.is_empty() || name.len() > 256 {
        return Err(AppError::Other("无效的单元名".into()));
    }
    for c in name.chars() {
        if !(c.is_ascii_alphanumeric() || matches!(c, '-' | '_' | '.' | '@' | '/')) {
            return Err(AppError::Other(format!("无效的单元名: {name}")));
        }
    }
    Ok(())
}

fn sudo_error(stderr: &str) -> Option<AppError> {
    let lower = stderr.to_lowercase();
    if lower.contains("a password is required") || lower.contains("sudo: password") {
        Some(AppError::Other(
            "需要 sudo 权限但无法免密执行。请配置免密 sudo（visudo）或使用 root 用户连接。".into(),
        ))
    } else {
        None
    }
}

const LIST_SCRIPT: &str =
    "systemctl list-units --type=service --all --no-legend --no-pager 2>/dev/null";

#[tauri::command]
pub async fn systemd_list_units(
    state: State<'_, AppState>,
    connection_id: String,
) -> AppResult<Vec<SystemdUnit>> {
    let entry = state.get_connection(&connection_id).await?;
    let r = entry.connection.exec(LIST_SCRIPT).await?;
    if r.exit_code != 0 {
        return Err(AppError::Other(format!(
            "systemctl 执行失败: {}",
            r.stderr.trim()
        )));
    }
    let mut units = Vec::new();
    for line in r.stdout.lines() {
        if line.is_empty() {
            continue;
        }
        let tokens: Vec<&str> = line.split_whitespace().collect();
        if tokens.is_empty() {
            continue;
        }
        // systemctl list-units 每行行首有一个圆点状态符 ●（--no-legend 不去除），跳过它
        let idx = if !tokens[0].chars().next().map(|c| c.is_ascii_alphanumeric()).unwrap_or(false) {
            1
        } else {
            0
        };
        let name = match tokens.get(idx) {
            Some(v) if !v.is_empty() => v,
            _ => continue,
        };
        let load_state = tokens.get(idx + 1).copied().unwrap_or("");
        // not-found 单元没有单元文件，是无法操作的垃圾条目，过滤掉
        if load_state == "not-found" {
            continue;
        }
        let active_state = tokens.get(idx + 2).copied().unwrap_or("");
        let sub_state = tokens.get(idx + 3).copied().unwrap_or("");
        let description: String = tokens[idx + 4..].join(" ");
        units.push(SystemdUnit {
            name: name.to_string(),
            load_state: load_state.to_string(),
            active_state: active_state.to_string(),
            sub_state: sub_state.to_string(),
            description,
        });
    }
    Ok(units)
}

#[tauri::command]
pub async fn systemd_unit_status(
    state: State<'_, AppState>,
    connection_id: String,
    name: String,
) -> AppResult<SystemdUnitStatus> {
    validate_unit_name(&name)?;
    let entry = state.get_connection(&connection_id).await?;
    let script = format!(
        "systemctl show {name} -p Description -p LoadState -p ActiveState -p SubState -p UnitFileState -p MainPID -p MemoryCurrent -p CPUUsageNSec -p ActiveEnterTimestamp -p InactiveEnterTimestamp -p FragmentPath --no-pager 2>/dev/null"
    );
    let r = entry.connection.exec(&script).await?;
    if r.exit_code != 0 {
        return Err(AppError::Other(format!(
            "获取单元状态失败: {}",
            r.stderr.trim()
        )));
    }

    let mut description = String::new();
    let mut load_state = String::new();
    let mut active_state = String::new();
    let mut sub_state = String::new();
    let mut unit_file_state = String::new();
    let mut main_pid: u64 = 0;
    let mut memory_current: u64 = 0;
    let mut cpu_usage_nsec: u64 = 0;
    let mut active_enter_timestamp = String::new();
    let mut inactive_enter_timestamp = String::new();
    let mut fragment_path = String::new();

    for line in r.stdout.lines() {
        if let Some((k, v)) = line.split_once('=') {
            match k {
                "Description" => description = v.to_string(),
                "LoadState" => load_state = v.to_string(),
                "ActiveState" => active_state = v.to_string(),
                "SubState" => sub_state = v.to_string(),
                "UnitFileState" => unit_file_state = v.to_string(),
                "MainPID" => main_pid = v.parse().unwrap_or(0),
                "MemoryCurrent" => {
                    memory_current = if v == "[not set]" || v.is_empty() {
                        0
                    } else {
                        v.parse().unwrap_or(0)
                    };
                }
                "CPUUsageNSec" => {
                    cpu_usage_nsec = if v == "[not set]" || v.is_empty() {
                        0
                    } else {
                        v.parse().unwrap_or(0)
                    };
                }
                "ActiveEnterTimestamp" => active_enter_timestamp = v.to_string(),
                "InactiveEnterTimestamp" => inactive_enter_timestamp = v.to_string(),
                "FragmentPath" => fragment_path = v.to_string(),
                _ => {}
            }
        }
    }

    Ok(SystemdUnitStatus {
        name,
        description,
        load_state,
        active_state,
        sub_state,
        unit_file_state,
        main_pid,
        memory_current,
        cpu_usage_nsec,
        active_enter_timestamp,
        inactive_enter_timestamp,
        fragment_path,
    })
}

async fn run_sudo_action(
    state: &State<'_, AppState>,
    connection_id: &str,
    action: &str,
    name: &str,
) -> AppResult<()> {
    validate_unit_name(name)?;
    let entry = state.get_connection(connection_id).await?;
    let script = format!("sudo -n systemctl {action} {name}");
    let r = entry.connection.exec(&script).await?;
    if r.exit_code != 0 {
        if let Some(e) = sudo_error(&r.stderr) {
            return Err(e);
        }
        return Err(AppError::Other(format!(
            "{action} 失败: {}",
            r.stderr.trim()
        )));
    }
    Ok(())
}

#[tauri::command]
pub async fn systemd_start(
    state: State<'_, AppState>,
    connection_id: String,
    name: String,
) -> AppResult<()> {
    run_sudo_action(&state, &connection_id, "start", &name).await
}

#[tauri::command]
pub async fn systemd_stop(
    state: State<'_, AppState>,
    connection_id: String,
    name: String,
) -> AppResult<()> {
    run_sudo_action(&state, &connection_id, "stop", &name).await
}

#[tauri::command]
pub async fn systemd_restart(
    state: State<'_, AppState>,
    connection_id: String,
    name: String,
) -> AppResult<()> {
    run_sudo_action(&state, &connection_id, "restart", &name).await
}

#[tauri::command]
pub async fn systemd_enable(
    state: State<'_, AppState>,
    connection_id: String,
    name: String,
) -> AppResult<()> {
    run_sudo_action(&state, &connection_id, "enable", &name).await
}

#[tauri::command]
pub async fn systemd_disable(
    state: State<'_, AppState>,
    connection_id: String,
    name: String,
) -> AppResult<()> {
    run_sudo_action(&state, &connection_id, "disable", &name).await
}

#[tauri::command]
pub async fn systemd_get_logs(
    state: State<'_, AppState>,
    connection_id: String,
    name: String,
    lines: u32,
) -> AppResult<String> {
    validate_unit_name(&name)?;
    let entry = state.get_connection(&connection_id).await?;
    let n = lines.clamp(10, 5000);
    let script = format!("sudo -n journalctl -u {name} -n {n} --no-pager 2>&1");
    let r = entry.connection.exec(&script).await?;
    if r.exit_code != 0 {
        if let Some(e) = sudo_error(&r.stderr) {
            return Err(e);
        }
        return Err(AppError::Other(format!(
            "读取日志失败: {}",
            r.stderr.trim()
        )));
    }
    Ok(r.stdout)
}

#[tauri::command]
pub async fn systemd_cat_unit(
    state: State<'_, AppState>,
    connection_id: String,
    name: String,
) -> AppResult<String> {
    validate_unit_name(&name)?;
    let entry = state.get_connection(&connection_id).await?;
    let script = format!("systemctl cat {name} --no-pager 2>&1");
    let r = entry.connection.exec(&script).await?;
    if r.exit_code != 0 {
        return Err(AppError::Other(format!(
            "读取单元文件失败: {}",
            r.stderr.trim()
        )));
    }
    Ok(r.stdout)
}

#[tauri::command]
pub async fn systemd_create_unit(
    state: State<'_, AppState>,
    connection_id: String,
    name: String,
    content_base64: String,
    enable: bool,
    start: bool,
) -> AppResult<()> {
    if name.is_empty() || name.contains('/') || name.contains("..") {
        return Err(AppError::Other("无效的单元名".into()));
    }
    for c in name.chars() {
        if !(c.is_ascii_alphanumeric() || matches!(c, '-' | '_' | '.' | '@')) {
            return Err(AppError::Other(format!("无效的单元名: {name}")));
        }
    }
    let unit_name = if name.ends_with(".service") {
        name.clone()
    } else {
        format!("{name}.service")
    };
    if content_base64.is_empty() {
        return Err(AppError::Other("单元内容不能为空".into()));
    }
    for c in content_base64.chars() {
        if !(c.is_ascii_alphanumeric() || matches!(c, '+' | '/' | '=')) {
            return Err(AppError::Other("无效的单元内容".into()));
        }
    }
    let entry = state.get_connection(&connection_id).await?;
    let path = format!("/etc/systemd/system/{unit_name}");
    let script = format!(
        "echo '{content_base64}' | base64 -d | sudo -n tee '{path}' > /dev/null && sudo -n systemctl daemon-reload"
    );
    let r = entry.connection.exec(&script).await?;
    if r.exit_code != 0 {
        if let Some(e) = sudo_error(&r.stderr) {
            return Err(e);
        }
        return Err(AppError::Other(format!(
            "创建服务失败: {}",
            r.stderr.trim()
        )));
    }
    if enable {
        let s = format!("sudo -n systemctl enable {unit_name}");
        let r = entry.connection.exec(&s).await?;
        if r.exit_code != 0 {
            return Err(AppError::Other(format!(
                "enable 失败: {}",
                r.stderr.trim()
            )));
        }
    }
    if start {
        let s = format!("sudo -n systemctl start {unit_name}");
        let r = entry.connection.exec(&s).await?;
        if r.exit_code != 0 {
            return Err(AppError::Other(format!(
                "start 失败: {}",
                r.stderr.trim()
            )));
        }
    }
    Ok(())
}
