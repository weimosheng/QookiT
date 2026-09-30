use std::sync::Arc;

use base64::{engine::general_purpose::STANDARD, Engine as _};
use tauri::State;

use crate::error::{AppError, AppResult};
use crate::ssh::{ExecResult, FileEntry, SftpManager};
use crate::state::AppState;

/// 取出 SFTP 会话句柄。
///
/// 只在取句柄时持读锁，返回后立即释放，因此大文件传输期间列目录、重命名等操作不会阻塞。
async fn sftp_handle(state: &State<'_, AppState>, connection_id: &str) -> AppResult<Arc<SftpManager>> {
    let entry = state.get_connection(connection_id).await?;
    let guard = entry.sftp.read().await;
    guard
        .as_ref()
        .cloned()
        .ok_or_else(|| AppError::Sftp("SFTP 未打开".into()))
}

async fn with_sftp<F, R>(state: &State<'_, AppState>, connection_id: &str, f: F) -> AppResult<R>
where
    F: for<'a> FnOnce(&'a SftpManager) -> std::pin::Pin<Box<dyn std::future::Future<Output = AppResult<R>> + Send + 'a>>,
{
    let sftp = sftp_handle(state, connection_id).await?;
    f(&sftp).await
}

#[tauri::command]
pub async fn sftp_open(state: State<'_, AppState>, connection_id: String) -> AppResult<()> {
    let entry = state.get_connection(&connection_id).await?;
    let mut sftp = entry.sftp.write().await;
    if sftp.is_none() {
        *sftp = Some(Arc::new(entry.connection.open_sftp().await?));
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
pub async fn sftp_read_file_progress(
    state: State<'_, AppState>,
    app: tauri::AppHandle,
    connection_id: String,
    path: String,
) -> AppResult<String> {
    let sftp = sftp_handle(&state, &connection_id).await?;
    let total_size = sftp.stat(&path).await.map(|e| e.size).unwrap_or(0);
    let data = sftp
        .read_file_with_progress(&path, total_size, &app, &connection_id)
        .await?;
    Ok(STANDARD.encode(&data))
}

#[tauri::command]
pub async fn sftp_download_file(
    state: State<'_, AppState>,
    app: tauri::AppHandle,
    connection_id: String,
    remote_path: String,
    local_path: String,
    transfer_id: String,
) -> AppResult<()> {
    let sftp = sftp_handle(&state, &connection_id).await?;
    let total_size = sftp.stat(&remote_path).await.map(|e| e.size).unwrap_or(0);
    sftp.download_to_local(&remote_path, &local_path, total_size, &app, &connection_id, &transfer_id)
        .await
}

#[tauri::command]
pub async fn sftp_upload_file(
    state: State<'_, AppState>,
    app: tauri::AppHandle,
    connection_id: String,
    local_path: String,
    remote_path: String,
    transfer_id: String,
) -> AppResult<()> {
    let sftp = sftp_handle(&state, &connection_id).await?;
    sftp.upload_from_local(&local_path, &remote_path, &app, &connection_id, &transfer_id)
        .await
}

#[tauri::command]
pub async fn sftp_upload_from_base64(
    state: State<'_, AppState>,
    app: tauri::AppHandle,
    connection_id: String,
    remote_path: String,
    data_base64: String,
    transfer_id: String,
) -> AppResult<()> {
    let sftp = sftp_handle(&state, &connection_id).await?;
    let data = STANDARD
        .decode(&data_base64)
        .map_err(|e| AppError::Other(format!("base64 解码失败: {e}")))?;
    sftp.upload_from_bytes(&data, &remote_path, &app, &connection_id, &transfer_id)
        .await
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
