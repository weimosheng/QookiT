use tauri::State;

use crate::error::AppResult;
use crate::hosts::SystemInfo;
use crate::state::AppState;

fn parse_free_m(stdout: &str) -> (Option<u64>, Option<u64>) {
    for line in stdout.lines() {
        let trimmed = line.trim_start();
        if trimmed.starts_with("Mem:") {
            let cols: Vec<&str> = line.split_whitespace().collect();
            let total = cols.get(1).and_then(|s| s.parse().ok());
            let available = if cols.len() >= 7 {
                cols.get(6).and_then(|s| s.parse().ok())
            } else {
                cols.last().and_then(|s| s.parse().ok())
            };
            return (total, available);
        }
    }
    (None, None)
}

fn parse_os_release(stdout: &str) -> Option<String> {
    let mut pretty = None;
    let mut name = None;
    for line in stdout.lines() {
        if let Some(v) = line.strip_prefix("PRETTY_NAME=") {
            pretty = Some(v.trim_matches('"').to_string());
        } else if let Some(v) = line.strip_prefix("NAME=") {
            name = Some(v.trim_matches('"').to_string());
        }
    }
    pretty.or(name)
}

#[tauri::command]
pub async fn get_system_info(
    state: State<'_, AppState>,
    host_id: String,
    connection_id: String,
) -> AppResult<SystemInfo> {
    let entry = state.get_connection(&connection_id).await?;
    let conn = &entry.connection;

    let os = match conn.exec("cat /etc/os-release").await {
        Ok(r) if r.exit_code == 0 => parse_os_release(&r.stdout),
        _ => None,
    };

    let (system, kernel, arch) = match conn.exec("uname -srm").await {
        Ok(r) if r.exit_code == 0 => {
            let parts: Vec<&str> = r.stdout.trim().split_whitespace().collect();
            (
                parts.get(0).map(|s| s.to_string()),
                parts.get(1).map(|s| s.to_string()),
                parts.get(2).map(|s| s.to_string()),
            )
        }
        _ => (None, None, None),
    };

    let cpu_cores = match conn.exec("nproc").await {
        Ok(r) if r.exit_code == 0 => r.stdout.trim().parse().ok(),
        _ => None,
    };

    let (mem_total_mb, mem_available_mb) = match conn.exec("free -m").await {
        Ok(r) if r.exit_code == 0 => parse_free_m(&r.stdout),
        _ => (None, None),
    };

    let info = SystemInfo {
        os,
        system,
        kernel,
        arch,
        cpu_cores,
        mem_total_mb,
        mem_available_mb,
    };

    let mut hosts = state.store.load()?;
    if let Some(h) = hosts.iter_mut().find(|h| h.id == host_id) {
        h.system_info = Some(info.clone());
        state.store.save(&hosts)?;
    }

    Ok(info)
}
