use tauri::State;

use crate::error::{AppError, AppResult};
use crate::state::AppState;
use crate::ssh::ExecResult;

#[derive(Clone, Debug, serde::Serialize)]
pub struct CronJob {
    pub line_number: u32,
    pub enabled: bool,
    pub minute: String,
    pub hour: String,
    pub day: String,
    pub month: String,
    pub weekday: String,
    pub command: String,
    pub comment: String,
    pub is_special: bool,
    pub special: String,
    pub raw: String,
}

#[derive(Clone, Debug, serde::Serialize)]
pub struct CronFile {
    pub name: String,
    pub size: u64,
    pub owner: String,
    pub modified: String,
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

fn is_env_line(s: &str) -> bool {
    if let Some(eq_idx) = s.find('=') {
        let name = &s[..eq_idx];
        !name.is_empty() && name.chars().all(|c| c.is_ascii_alphanumeric() || c == '_')
    } else {
        false
    }
}

fn parse_cron_line(line: &str, line_number: u32, enabled: bool) -> Option<CronJob> {
    let tokens: Vec<&str> = line.split_whitespace().collect();
    if tokens.is_empty() {
        return None;
    }

    if tokens[0].starts_with('@') {
        let special = tokens[0].to_string();
        let command = tokens[1..].join(" ");
        if command.is_empty() {
            return None;
        }
        return Some(CronJob {
            line_number,
            enabled,
            minute: String::new(),
            hour: String::new(),
            day: String::new(),
            month: String::new(),
            weekday: String::new(),
            command,
            comment: String::new(),
            is_special: true,
            special,
            raw: line.to_string(),
        });
    }

    if tokens.len() < 6 {
        return None;
    }

    for i in 0..5 {
        if tokens[i].contains('=') {
            return None;
        }
    }

    Some(CronJob {
        line_number,
        enabled,
        minute: tokens[0].to_string(),
        hour: tokens[1].to_string(),
        day: tokens[2].to_string(),
        month: tokens[3].to_string(),
        weekday: tokens[4].to_string(),
        command: tokens[5..].join(" "),
        comment: String::new(),
        is_special: false,
        special: String::new(),
        raw: line.to_string(),
    })
}

fn parse_crontab(content: &str) -> Vec<CronJob> {
    let mut jobs = Vec::new();
    let mut pending_comment = String::new();

    for (i, line) in content.lines().enumerate() {
        let trimmed = line.trim();

        if trimmed.is_empty() {
            pending_comment.clear();
            continue;
        }

        if trimmed.starts_with('#') {
            let after_hash = trimmed[1..].trim();
            if let Some(mut job) = parse_cron_line(after_hash, i as u32 + 1, false) {
                job.comment = pending_comment.clone();
                jobs.push(job);
                pending_comment.clear();
            } else {
                if !pending_comment.is_empty() {
                    pending_comment.push('\n');
                }
                pending_comment.push_str(trimmed);
            }
            continue;
        }

        if is_env_line(trimmed) {
            pending_comment.clear();
            continue;
        }

        if let Some(mut job) = parse_cron_line(trimmed, i as u32 + 1, true) {
            job.comment = pending_comment.clone();
            jobs.push(job);
            pending_comment.clear();
        }
    }

    jobs
}

fn validate_base64(s: &str) -> AppResult<()> {
    if s.is_empty() {
        return Err(AppError::Other("内容不能为空".into()));
    }
    for c in s.chars() {
        if !(c.is_ascii_alphanumeric() || matches!(c, '+' | '/' | '=')) {
            return Err(AppError::Other("无效的内容编码".into()));
        }
    }
    Ok(())
}

fn validate_file_name(name: &str) -> AppResult<()> {
    if name.is_empty() || name.contains('/') || name.contains("..") {
        return Err(AppError::Other("无效的文件名".into()));
    }
    for c in name.chars() {
        if !(c.is_ascii_alphanumeric() || matches!(c, '-' | '_' | '.')) {
            return Err(AppError::Other(format!("无效的文件名: {name}")));
        }
    }
    Ok(())
}

#[tauri::command]
pub async fn cron_list_jobs(
    state: State<'_, AppState>,
    connection_id: String,
) -> AppResult<Vec<CronJob>> {
    let entry = state.get_connection(&connection_id).await?;
    let r = entry.connection.exec("crontab -l 2>/dev/null").await?;
    let content = if r.exit_code == 0 { &r.stdout } else { "" };
    Ok(parse_crontab(content))
}

#[tauri::command]
pub async fn cron_get_crontab_raw(
    state: State<'_, AppState>,
    connection_id: String,
) -> AppResult<String> {
    let entry = state.get_connection(&connection_id).await?;
    let r = entry.connection.exec("crontab -l 2>/dev/null").await?;
    Ok(if r.exit_code == 0 { r.stdout } else { String::new() })
}

#[tauri::command]
pub async fn cron_set_crontab_raw(
    state: State<'_, AppState>,
    connection_id: String,
    content_base64: String,
) -> AppResult<()> {
    validate_base64(&content_base64)?;
    let entry = state.get_connection(&connection_id).await?;
    let script = format!("echo '{content_base64}' | base64 -d | crontab -");
    let r = entry.connection.exec(&script).await?;
    if r.exit_code != 0 {
        return Err(AppError::Other(format!(
            "更新 crontab 失败: {}",
            r.stderr.trim()
        )));
    }
    Ok(())
}

#[tauri::command]
pub async fn cron_get_logs(
    state: State<'_, AppState>,
    connection_id: String,
    lines: u32,
) -> AppResult<String> {
    let entry = state.get_connection(&connection_id).await?;
    let n = lines.clamp(10, 5000);
    let script = format!(
        "sudo -n journalctl -u cron -n {n} --no-pager 2>/dev/null || sudo -n tail -n {n} /var/log/cron 2>/dev/null || sudo -n tail -n {n} /var/log/cron.log 2>/dev/null || echo '无法读取 cron 日志（需要 sudo 权限或日志文件不存在）'"
    );
    let r = entry.connection.exec(&script).await?;
    Ok(r.stdout)
}

#[tauri::command]
pub async fn cron_list_system_files(
    state: State<'_, AppState>,
    connection_id: String,
) -> AppResult<Vec<CronFile>> {
    let entry = state.get_connection(&connection_id).await?;
    let r = entry
        .connection
        .exec("sudo -n ls -la /etc/cron.d/ 2>/dev/null")
        .await?;
    if r.exit_code != 0 {
        if let Some(e) = sudo_error(&r.stderr) {
            return Err(e);
        }
        return Ok(Vec::new());
    }
    let mut files = Vec::new();
    for line in r.stdout.lines().skip(2) {
        let tokens: Vec<&str> = line.split_whitespace().collect();
        if tokens.len() < 9 {
            continue;
        }
        let name = tokens[tokens.len() - 1];
        if name == "." || name == ".." {
            continue;
        }
        let size: u64 = tokens[4].parse().unwrap_or(0);
        let owner = tokens[2].to_string();
        let modified = tokens[5..tokens.len() - 1].join(" ");
        files.push(CronFile {
            name: name.to_string(),
            size,
            owner,
            modified,
        });
    }
    Ok(files)
}

#[tauri::command]
pub async fn cron_get_system_file(
    state: State<'_, AppState>,
    connection_id: String,
    name: String,
) -> AppResult<String> {
    validate_file_name(&name)?;
    let entry = state.get_connection(&connection_id).await?;
    let script = format!("sudo -n cat /etc/cron.d/{name} 2>/dev/null");
    let r = entry.connection.exec(&script).await?;
    if r.exit_code != 0 {
        if let Some(e) = sudo_error(&r.stderr) {
            return Err(e);
        }
        return Err(AppError::Other(format!(
            "读取文件失败: {}",
            r.stderr.trim()
        )));
    }
    Ok(r.stdout)
}

#[tauri::command]
pub async fn cron_write_system_file(
    state: State<'_, AppState>,
    connection_id: String,
    name: String,
    content_base64: String,
) -> AppResult<()> {
    validate_file_name(&name)?;
    validate_base64(&content_base64)?;
    let entry = state.get_connection(&connection_id).await?;
    let script = format!(
        "echo '{content_base64}' | base64 -d | sudo -n tee /etc/cron.d/{name} > /dev/null"
    );
    let r = entry.connection.exec(&script).await?;
    if r.exit_code != 0 {
        if let Some(e) = sudo_error(&r.stderr) {
            return Err(e);
        }
        return Err(AppError::Other(format!(
            "写入文件失败: {}",
            r.stderr.trim()
        )));
    }
    Ok(())
}

#[tauri::command]
pub async fn cron_remove_system_file(
    state: State<'_, AppState>,
    connection_id: String,
    name: String,
) -> AppResult<()> {
    validate_file_name(&name)?;
    let entry = state.get_connection(&connection_id).await?;
    let script = format!("sudo -n rm -f /etc/cron.d/{name}");
    let r = entry.connection.exec(&script).await?;
    if r.exit_code != 0 {
        if let Some(e) = sudo_error(&r.stderr) {
            return Err(e);
        }
        return Err(AppError::Other(format!(
            "删除文件失败: {}",
            r.stderr.trim()
        )));
    }
    Ok(())
}

#[tauri::command]
pub async fn cron_get_job_logs(
    state: State<'_, AppState>,
    connection_id: String,
    command: String,
    lines: u32,
) -> AppResult<String> {
    let entry = state.get_connection(&connection_id).await?;
    let n = lines.clamp(10, 5000);
    let safe_cmd = command.replace('\'', "'\\''");
    let script = format!(
        "sudo -n journalctl -u cron -n {n} --no-pager 2>/dev/null | grep -F '{safe_cmd}' || sudo -n tail -n {n} /var/log/cron 2>/dev/null | grep -F '{safe_cmd}' || echo '未找到该任务的日志'"
    );
    let r = entry.connection.exec(&script).await?;
    Ok(r.stdout)
}

#[tauri::command]
pub async fn cron_run_job(
    state: State<'_, AppState>,
    connection_id: String,
    command: String,
) -> AppResult<ExecResult> {
    let entry = state.get_connection(&connection_id).await?;
    entry.connection.exec(&command).await
}
