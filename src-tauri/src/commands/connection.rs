use std::collections::HashMap;
use std::sync::Arc;

use serde::Serialize;
use tauri::{AppHandle, State};
use tokio::sync::{Mutex, RwLock};

use crate::error::{AppError, AppResult};
use crate::ssh::Connection;
use crate::state::{AppState, ConnectionEntry};
use tokio_util::sync::CancellationToken;

#[derive(Serialize)]
pub struct ConnectionInfo {
    pub connection_id: String,
    pub host_id: String,
    pub host_name: String,
}

#[tauri::command]
pub async fn connect_host(
    app: AppHandle,
    state: State<'_, AppState>,
    host_id: String,
) -> AppResult<ConnectionInfo> {
    let hosts = state.store.load()?;
    let host = hosts
        .iter()
        .find(|h| h.id == host_id)
        .ok_or_else(|| AppError::HostNotFound(host_id.clone()))?;

    let cancel = CancellationToken::new();
    state
        .connecting
        .lock()
        .await
        .insert(host_id.clone(), cancel.clone());

    let result = Connection::connect(
        &app,
        &host_id,
        &host.host,
        host.port,
        &host.username,
        &host.auth,
        cancel,
    )
    .await;

    state.connecting.lock().await.remove(&host_id);

    let connection = result?;
    let connection_id = connection.id.clone();
    let host_name = host.name.clone();

    let entry = Arc::new(ConnectionEntry {
        connection,
        sftp: Arc::new(RwLock::new(None)),
        terminals: Arc::new(Mutex::new(HashMap::new())),
    });

    state
        .connections
        .lock()
        .await
        .insert(connection_id.clone(), entry);

    Ok(ConnectionInfo {
        connection_id,
        host_id,
        host_name,
    })
}

/// 取消进行中的连接：按 host_id 找到取消令牌并触发中断。
#[tauri::command]
pub async fn cancel_connect(state: State<'_, AppState>, host_id: String) -> AppResult<()> {
    if let Some(token) = state.connecting.lock().await.remove(&host_id) {
        token.cancel();
    }
    Ok(())
}

#[tauri::command]
pub async fn disconnect_host(
    state: State<'_, AppState>,
    connection_id: String,
) -> AppResult<()> {
    let entry = state
        .connections
        .lock()
        .await
        .remove(&connection_id)
        .ok_or_else(|| AppError::ConnectionNotFound(connection_id.clone()))?;

    {
        let mut terminals = entry.terminals.lock().await;
        for (_, t) in terminals.drain() {
            let _ = t.close();
        }
    }
    {
        let mut sftp = entry.sftp.write().await;
        if let Some(s) = sftp.take() {
            drop(s);
        }
    }
    entry.connection.disconnect().await?;
    Ok(())
}

#[tauri::command]
pub async fn ping_host(host: String, port: u16) -> AppResult<u64> {
    let start = std::time::Instant::now();
    match tokio::time::timeout(
        std::time::Duration::from_secs(5),
        tokio::net::TcpStream::connect((host.as_str(), port)),
    )
    .await
    {
        Ok(Ok(_)) => Ok(start.elapsed().as_millis() as u64),
        Ok(Err(_)) => Err(AppError::Ssh("连接失败".into())),
        Err(_) => Err(AppError::Ssh("超时".into())),
    }
}

/// 该主机已记录的主机密钥（`算法 指纹`）。
#[tauri::command]
pub async fn known_host_fingerprints(host: String, port: u16) -> AppResult<Vec<String>> {
    crate::ssh::host_key::recorded(&host, port)
}

/// 清除该主机已记录的主机密钥，返回删除的条目数。
///
/// 仅在服务器确实更换了密钥、需要重新建立信任时使用。
#[tauri::command]
pub async fn forget_host_key(host: String, port: u16) -> AppResult<usize> {
    crate::ssh::host_key::forget(&host, port)
}
