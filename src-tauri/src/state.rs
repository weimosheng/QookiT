use std::collections::HashMap;
use std::sync::Arc;

use tokio::sync::Mutex;

use crate::error::{AppError, AppResult};
use crate::hosts::HostStore;
use crate::ssh::{Connection, SftpManager, TerminalChannel};

pub struct ConnectionEntry {
    pub connection: Connection,
    pub sftp: Arc<Mutex<Option<SftpManager>>>,
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
