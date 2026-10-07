use tauri::{AppHandle, State};
use uuid::Uuid;

use crate::error::AppResult;
use crate::ssh::{ForwardInfo, ForwardKind, ForwardSpec};
use crate::state::AppState;

#[tauri::command]
pub async fn forward_add(
    app: AppHandle,
    state: State<'_, AppState>,
    connection_id: String,
    kind: ForwardKind,
    local_host: String,
    local_port: u16,
    remote_host: String,
    remote_port: u16,
) -> AppResult<String> {
    let entry = state.get_connection(&connection_id).await?;
    let forward_id = Uuid::new_v4().to_string();
    let spec = ForwardSpec {
        kind,
        local_host,
        local_port,
        remote_host,
        remote_port,
    };
    let connection = entry.connection.clone();
    let mut forwards = entry.forwards.lock().await;
    forwards
        .spawn(app, connection_id, forward_id.clone(), spec, connection)
        .await?;
    Ok(forward_id)
}

#[tauri::command]
pub async fn forward_remove(
    state: State<'_, AppState>,
    connection_id: String,
    forward_id: String,
) -> AppResult<()> {
    let entry = state.get_connection(&connection_id).await?;
    let mut forwards = entry.forwards.lock().await;
    forwards.remove(&forward_id).await
}

#[tauri::command]
pub async fn forward_list(
    state: State<'_, AppState>,
    connection_id: String,
) -> AppResult<Vec<ForwardInfo>> {
    let entry = state.get_connection(&connection_id).await?;
    let forwards = entry.forwards.lock().await;
    Ok(forwards.list().await)
}
