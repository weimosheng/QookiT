use tauri::State;

use crate::error::{AppError, AppResult};
use crate::hosts::{AuthMethod, Host};
use crate::state::AppState;

/// 脱敏：清除凭据明文，仅保留结构供列表展示。
///
/// 列表常驻前端内存，不应包含密码/私钥明文。编辑主机时前端也拿不到明文，
/// 凭据字段留空即表示「沿用原值」（见 `update_host`），从而避免明文凭据
/// 出现在渲染层（一旦发生 XSS 会被一次性窃取）。
fn redact(mut host: Host) -> Host {
    host.auth = match host.auth {
        AuthMethod::Password { .. } => AuthMethod::Password {
            password: String::new(),
        },
        AuthMethod::PrivateKey { .. } => AuthMethod::PrivateKey {
            key_content: String::new(),
            passphrase: None,
        },
    };
    host
}

#[tauri::command]
pub async fn list_hosts(state: State<'_, AppState>) -> AppResult<Vec<Host>> {
    Ok(state.store.load()?.into_iter().map(redact).collect())
}

#[tauri::command]
pub async fn add_host(state: State<'_, AppState>, host: Host) -> AppResult<Vec<Host>> {
    let mut hosts = state.store.load()?;
    hosts.push(host);
    state.store.save(&hosts)?;
    Ok(hosts.into_iter().map(redact).collect())
}

#[tauri::command]
pub async fn update_host(state: State<'_, AppState>, host: Host) -> AppResult<Vec<Host>> {
    let mut hosts = state.store.load()?;
    let now = chrono::Utc::now();
    if let Some(h) = hosts.iter_mut().find(|h| h.id == host.id) {
        let mut new_host = host;
        new_host.updated_at = now;
        // 前端不回填明文凭据：当认证方式未变且凭据字段为空时，保留原凭据。
        let old_auth = h.auth.clone();
        new_host.auth = match (new_host.auth, old_auth) {
            (AuthMethod::Password { password }, AuthMethod::Password { password: old })
                if password.is_empty() =>
            {
                AuthMethod::Password { password: old }
            }
            (
                AuthMethod::PrivateKey { key_content, .. },
                AuthMethod::PrivateKey {
                    key_content: old_key,
                    passphrase: old_pass,
                },
            ) if key_content.trim().is_empty() => AuthMethod::PrivateKey {
                key_content: old_key,
                passphrase: old_pass,
            },
            (new_auth, _) => new_auth,
        };
        *h = new_host;
    } else {
        return Err(AppError::HostNotFound(host.id));
    }
    state.store.save(&hosts)?;
    Ok(hosts.into_iter().map(redact).collect())
}

#[tauri::command]
pub async fn delete_host(state: State<'_, AppState>, id: String) -> AppResult<Vec<Host>> {
    let mut hosts = state.store.load()?;
    hosts.retain(|h| h.id != id);
    state.store.save(&hosts)?;
    Ok(hosts.into_iter().map(redact).collect())
}
