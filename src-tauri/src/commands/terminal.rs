use tauri::{AppHandle, State};
use uuid::Uuid;

use crate::error::{AppError, AppResult};
use crate::state::AppState;

#[tauri::command]
pub async fn open_terminal(
    app: AppHandle,
    state: State<'_, AppState>,
    connection_id: String,
    cols: u32,
    rows: u32,
) -> AppResult<String> {
    let entry = state.get_connection(&connection_id).await?;
    let terminal_id = Uuid::new_v4().to_string();
    let terminal = entry
        .connection
        .open_terminal(app, connection_id, terminal_id.clone(), cols, rows)
        .await?;
    entry
        .terminals
        .lock()
        .await
        .insert(terminal_id.clone(), terminal);
    Ok(terminal_id)
}

#[tauri::command]
pub async fn terminal_write(
    state: State<'_, AppState>,
    connection_id: String,
    terminal_id: String,
    data: String,
) -> AppResult<()> {
    let entry = state.get_connection(&connection_id).await?;
    let terminals = entry.terminals.lock().await;
    let terminal = terminals
        .get(&terminal_id)
        .ok_or_else(|| AppError::TerminalNotFound(terminal_id.clone()))?;
    terminal.write(data.into_bytes())
}

#[tauri::command]
pub async fn terminal_resize(
    state: State<'_, AppState>,
    connection_id: String,
    terminal_id: String,
    cols: u32,
    rows: u32,
) -> AppResult<()> {
    let entry = state.get_connection(&connection_id).await?;
    let terminals = entry.terminals.lock().await;
    let terminal = terminals
        .get(&terminal_id)
        .ok_or_else(|| AppError::TerminalNotFound(terminal_id.clone()))?;
    terminal.resize(cols, rows)
}

#[tauri::command]
pub async fn close_terminal(
    state: State<'_, AppState>,
    connection_id: String,
    terminal_id: String,
) -> AppResult<()> {
    let entry = state.get_connection(&connection_id).await?;
    let mut terminals = entry.terminals.lock().await;
    if let Some(terminal) = terminals.remove(&terminal_id) {
        terminal.close()?;
    }
    Ok(())
}
