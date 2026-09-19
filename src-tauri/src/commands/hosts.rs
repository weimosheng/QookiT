use tauri::State;

use crate::error::{AppError, AppResult};
use crate::hosts::Host;
use crate::state::AppState;

#[tauri::command]
pub async fn list_hosts(state: State<'_, AppState>) -> AppResult<Vec<Host>> {
    state.store.load()
}

#[tauri::command]
pub async fn add_host(state: State<'_, AppState>, host: Host) -> AppResult<Vec<Host>> {
    let mut hosts = state.store.load()?;
    hosts.push(host);
    state.store.save(&hosts)?;
    Ok(hosts)
}

#[tauri::command]
pub async fn update_host(state: State<'_, AppState>, host: Host) -> AppResult<Vec<Host>> {
    let mut hosts = state.store.load()?;
    let now = chrono::Utc::now();
    if let Some(h) = hosts.iter_mut().find(|h| h.id == host.id) {
        let mut new_host = host;
        new_host.updated_at = now;
        *h = new_host;
    } else {
        return Err(AppError::HostNotFound(host.id));
    }
    state.store.save(&hosts)?;
    Ok(hosts)
}

#[tauri::command]
pub async fn delete_host(state: State<'_, AppState>, id: String) -> AppResult<Vec<Host>> {
    let mut hosts = state.store.load()?;
    hosts.retain(|h| h.id != id);
    state.store.save(&hosts)?;
    Ok(hosts)
}
