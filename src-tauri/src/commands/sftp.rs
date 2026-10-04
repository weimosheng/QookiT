use std::sync::Arc;

use base64::{engine::general_purpose::STANDARD, Engine as _};
use tauri::State;

use crate::error::{AppError, AppResult};
use crate::ssh::{ExecResult, FileEntry, SftpManager};
use crate::state::AppState;

/// base64 上传/写入的输入上限（约 256 MB 解码后），防止恶意超大 payload 撑爆内存。
/// base64 编码膨胀约 4/3，故输入字符串上限取 340 MB。
const MAX_BASE64_INPUT_LEN: usize = 340 * 1024 * 1024;

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

/// 校验前端传入的本地路径是否落在用户已授权的文件系统作用域内。
///
/// 上传/下载直接在 Rust 侧读写本地文件，若不校验，渲染层一旦被注入即可读写任意
/// 用户文件（例如覆盖 `~/.ssh/authorized_keys`、读取 `~/.ssh/id_rsa`）。
/// 这里复用 Tauri 的 fs scope：只有经系统文件选择框（`plugin-dialog`）选过、
/// 因而被加入 scope 的路径才允许读写 —— 与 `tauri-plugin-fs` 的授权口径一致。
fn ensure_local_path_allowed(app: &tauri::AppHandle, path: &str) -> AppResult<()> {
    use tauri_plugin_fs::FsExt;

    let Some(scope) = app.try_fs_scope() else {
        return Err(AppError::Other(
            "文件系统插件未初始化，无法校验本地路径".into(),
        ));
    };
    let target = std::path::Path::new(path);
    if scope.is_allowed(target) {
        return Ok(());
    }
    // 目标文件可能尚不存在（另存为下载），此时退回校验其父目录是否已授权。
    if let Some(parent) = target.parent() {
        if !parent.as_os_str().is_empty() && scope.is_allowed(parent) {
            return Ok(());
        }
    }
    Err(AppError::Other(format!(
        "本地路径不在允许范围内：{path}；请通过文件选择对话框指定路径"
    )))
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
    ensure_local_path_allowed(&app, &local_path)?;
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
    ensure_local_path_allowed(&app, &local_path)?;
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
    if data_base64.len() > MAX_BASE64_INPUT_LEN {
        return Err(AppError::Other(format!(
            "数据过大（{} 字节），上限 {} MB",
            data_base64.len(),
            MAX_BASE64_INPUT_LEN / 1024 / 1024
        )));
    }
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
    if data_base64.len() > MAX_BASE64_INPUT_LEN {
        return Err(AppError::Other(format!(
            "数据过大（{} 字节），上限 {} MB",
            data_base64.len(),
            MAX_BASE64_INPUT_LEN / 1024 / 1024
        )));
    }
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
