use base64::{engine::general_purpose::STANDARD, Engine as _};
use tauri::State;

use crate::error::{AppError, AppResult};
use crate::ssh::{ExecResult, FileEntry};
use crate::state::AppState;

async fn with_sftp<F, R>(state: &State<'_, AppState>, connection_id: &str, f: F) -> AppResult<R>
where
    F: for<'a> FnOnce(&'a crate::ssh::SftpManager) -> std::pin::Pin<Box<dyn std::future::Future<Output = AppResult<R>> + Send + 'a>>,
{
    let entry = state.get_connection(connection_id).await?;
    let sftp_guard = entry.sftp.lock().await;
    let sftp = sftp_guard
        .as_ref()
        .ok_or_else(|| AppError::Sftp("SFTP 未打开".into()))?;
    f(sftp).await
}

#[tauri::command]
pub async fn sftp_open(state: State<'_, AppState>, connection_id: String) -> AppResult<()> {
    let entry = state.get_connection(&connection_id).await?;
    let mut sftp = entry.sftp.lock().await;
    if sftp.is_none() {
        *sftp = Some(entry.connection.open_sftp().await?);
    }
    Ok(())
}

#[tauri::command]
pub async fn sftp_list_dir(
    state: State<'_, AppState>,
    connection_id: String,
    path: String,
) -> AppResult<Vec<FileEntry>> {
    with_sftp(&state, &connection_id, |sftp| {
        Box::pin(async move { sftp.list_dir(&path).await })
    })
    .await
}

#[tauri::command]
pub async fn sftp_stat(
    state: State<'_, AppState>,
    connection_id: String,
    path: String,
) -> AppResult<FileEntry> {
    with_sftp(&state, &connection_id, |sftp| {
        Box::pin(async move { sftp.stat(&path).await })
    })
    .await
}

#[tauri::command]
pub async fn sftp_mkdir(
    state: State<'_, AppState>,
    connection_id: String,
    path: String,
) -> AppResult<()> {
    with_sftp(&state, &connection_id, |sftp| {
        Box::pin(async move { sftp.mkdir(&path).await })
    })
    .await
}

#[tauri::command]
pub async fn sftp_remove_file(
    state: State<'_, AppState>,
    connection_id: String,
    path: String,
) -> AppResult<()> {
    with_sftp(&state, &connection_id, |sftp| {
        Box::pin(async move { sftp.remove_file(&path).await })
    })
    .await
}

#[tauri::command]
pub async fn sftp_remove_dir(
    state: State<'_, AppState>,
    connection_id: String,
    path: String,
) -> AppResult<()> {
    with_sftp(&state, &connection_id, |sftp| {
        Box::pin(async move { sftp.remove_dir(&path).await })
    })
    .await
}

#[tauri::command]
pub async fn sftp_rename(
    state: State<'_, AppState>,
    connection_id: String,
    from: String,
    to: String,
) -> AppResult<()> {
    with_sftp(&state, &connection_id, |sftp| {
        Box::pin(async move { sftp.rename(&from, &to).await })
    })
    .await
}

#[tauri::command]
pub async fn sftp_read_file(
    state: State<'_, AppState>,
    connection_id: String,
    path: String,
) -> AppResult<String> {
    let data = with_sftp(&state, &connection_id, |sftp| {
        Box::pin(async move { sftp.read_file(&path).await })
    })
    .await?;
    Ok(STANDARD.encode(&data))
}

#[tauri::command]
pub async fn sftp_write_file(
    state: State<'_, AppState>,
    connection_id: String,
    path: String,
    data_base64: String,
) -> AppResult<()> {
    let data = STANDARD
        .decode(data_base64)
        .map_err(|e| AppError::Other(e.to_string()))?;
    with_sftp(&state, &connection_id, |sftp| {
        Box::pin(async move { sftp.write_file(&path, data).await })
    })
    .await
}

#[tauri::command]
pub async fn sftp_canonicalize(
    state: State<'_, AppState>,
    connection_id: String,
    path: String,
) -> AppResult<String> {
    with_sftp(&state, &connection_id, |sftp| {
        Box::pin(async move { sftp.canonicalize(&path).await })
    })
    .await
}

#[tauri::command]
pub async fn ssh_exec(
    state: State<'_, AppState>,
    connection_id: String,
    command: String,
) -> AppResult<ExecResult> {
    let entry = state.get_connection(&connection_id).await?;
    entry.connection.exec(&command).await
}
