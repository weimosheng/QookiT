use std::collections::HashMap;
use std::sync::Arc;

use serde::Serialize;
use tauri::{AppHandle, State};
use tokio::sync::Mutex;

use crate::error::{AppError, AppResult};
use crate::ssh::Connection;
use crate::state::{AppState, ConnectionEntry};

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

    let connection =
        Connection::connect(&app, &host_id, &host.host, host.port, &host.username, &host.auth)
            .await?;
    let connection_id = connection.id.clone();
    let host_name = host.name.clone();

    let entry = Arc::new(ConnectionEntry {
        connection,
        sftp: Arc::new(Mutex::new(None)),
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
        let mut sftp = entry.sftp.lock().await;
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
