use std::collections::HashMap;
use std::sync::Arc;

use tokio::sync::{Mutex, RwLock};

use crate::error::{AppError, AppResult};
use crate::hosts::HostStore;
use crate::ssh::{Connection, SftpManager, TerminalChannel};

pub struct ConnectionEntry {
    pub connection: Connection,
    /// SFTP 会话句柄。
    ///
    /// 用 `RwLock<Option<Arc<..>>>` 而非 `Mutex<Option<..>>`：取用时只需短暂读锁，
    /// 之后的传输、列目录、上传下载均持句柄进行，互不阻塞；
    /// `SftpSession` 的方法都只借用 `&self`（内部按请求 id 复用通道），可以并发调用。
    pub sftp: Arc<RwLock<Option<Arc<SftpManager>>>>,
    pub terminals: Arc<Mutex<HashMap<String, TerminalChannel>>>,
}

pub struct AppState {
    pub store: HostStore,
    pub connections: Arc<Mutex<HashMap<String, Arc<ConnectionEntry>>>>,
}

impl AppState {
    pub fn new(store: HostStore) -> Self {
        Self {
            store,
            connections: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    pub async fn get_connection(&self, id: &str) -> AppResult<Arc<ConnectionEntry>> {
        let conns = self.connections.lock().await;
        conns
            .get(id)
            .cloned()
            .ok_or_else(|| AppError::ConnectionNotFound(id.into()))
    }
}
