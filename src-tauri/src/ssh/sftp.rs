use russh_sftp::client::SftpSession;
use russh_sftp::protocol::OpenFlags;
use serde::Serialize;
use tauri::Emitter;
use tokio::fs::File;
use tokio::io::{AsyncReadExt, AsyncWriteExt};

use crate::error::{AppError, AppResult};
use crate::events::{
    EVENT_FILE_READ_PROGRESS, EVENT_FILE_TRANSFER_PROGRESS, FileReadProgressPayload,
    FileTransferProgressPayload,
};

#[derive(Clone, Debug, Serialize)]
pub struct FileEntry {
    pub name: String,
    pub path: String,
    pub size: u64,
    pub is_dir: bool,
    pub is_file: bool,
    pub is_symlink: bool,
    pub modified: Option<u64>,
    pub permissions: Option<u32>,
}

pub struct SftpManager {
    session: SftpSession,
}

fn sftp_err<E: std::fmt::Display>(e: E) -> AppError {
    AppError::Sftp(e.to_string())
}

impl SftpManager {
    pub fn new(session: SftpSession) -> Self {
        Self { session }
    }

    pub async fn list_dir(&self, path: &str) -> AppResult<Vec<FileEntry>> {
        let read_dir = self.session.read_dir(path).await.map_err(sftp_err)?;
        let entries: Vec<_> = read_dir.collect();
        Ok(entries
            .into_iter()
            .filter_map(|e| {
                let name = e.file_name();
                if name == "." || name == ".." {
                    return None;
                }
                let md = e.metadata();
                Some(FileEntry {
                    name,
                    path: e.path(),
                    size: md.size.unwrap_or(0),
                    is_dir: md.is_dir(),
                    is_file: !md.is_dir() && !md.is_symlink(),
                    is_symlink: md.is_symlink(),
                    modified: md.mtime.map(|t| t as u64),
                    permissions: md.permissions,
                })
            })
            .collect())
    }

    pub async fn stat(&self, path: &str) -> AppResult<FileEntry> {
        let md = self.session.metadata(path).await.map_err(sftp_err)?;
        let name = path.rsplit('/').next().unwrap_or(path).to_string();
        Ok(FileEntry {
            name,
            path: path.to_string(),
            size: md.size.unwrap_or(0),
            is_dir: md.is_dir(),
            is_file: !md.is_dir() && !md.is_symlink(),
            is_symlink: md.is_symlink(),
            modified: md.mtime.map(|t| t as u64),
            permissions: md.permissions,
        })
    }

    pub async fn mkdir(&self, path: &str) -> AppResult<()> {
        self.session.create_dir(path).await.map_err(sftp_err)
    }

    pub async fn remove_file(&self, path: &str) -> AppResult<()> {
        self.session.remove_file(path).await.map_err(sftp_err)
    }

    pub async fn remove_dir(&self, path: &str) -> AppResult<()> {
        let entries = self.list_dir(path).await?;
        for entry in entries {
            if entry.is_dir {
                Box::pin(self.remove_dir(&entry.path)).await?;
            } else {
                self.remove_file(&entry.path).await?;
            }
        }
        self.session.remove_dir(path).await.map_err(sftp_err)
    }

    pub async fn rename(&self, from: &str, to: &str) -> AppResult<()> {
        self.session.rename(from, to).await.map_err(sftp_err)
    }

    pub async fn read_file(&self, path: &str) -> AppResult<Vec<u8>> {
        self.session.read(path).await.map_err(sftp_err)
    }

    pub async fn read_file_with_progress(
        &self,
        path: &str,
        total_size: u64,
        app: &tauri::AppHandle,
        connection_id: &str,
    ) -> AppResult<Vec<u8>> {
        let mut file = self.session.open(path).await.map_err(sftp_err)?;
        let chunk_size = 64 * 1024;
        let mut buffer = vec![0u8; chunk_size];
        let mut all = Vec::with_capacity(total_size as usize);
        loop {
            let n = file.read(&mut buffer).await.map_err(sftp_err)?;
            if n == 0 {
                break;
            }
            all.extend_from_slice(&buffer[..n]);
            let _ = app.emit(
                EVENT_FILE_READ_PROGRESS,
                FileReadProgressPayload {
                    connection_id: connection_id.to_string(),
                    path: path.to_string(),
                    read_bytes: all.len() as u64,
                    total_bytes: total_size,
                },
            );
        }
        Ok(all)
    }

    pub async fn write_file(&self, path: &str, data: Vec<u8>) -> AppResult<()> {
        self.session.write(path, &data).await.map_err(sftp_err)
    }

    pub async fn download_to_local(
        &self,
        remote_path: &str,
        local_path: &str,
        total_size: u64,
        app: &tauri::AppHandle,
        connection_id: &str,
        transfer_id: &str,
    ) -> AppResult<()> {
        let mut remote = self.session.open(remote_path).await.map_err(sftp_err)?;
        let mut local = File::create(local_path).await.map_err(sftp_err)?;
        let filename = remote_path
            .rsplit('/')
            .next()
            .unwrap_or(remote_path)
            .to_string();
        let chunk_size = 64 * 1024;
        let mut buffer = vec![0u8; chunk_size];
        let mut transferred = 0u64;
        loop {
            let n = remote.read(&mut buffer).await.map_err(sftp_err)?;
            if n == 0 {
                break;
            }
            local.write_all(&buffer[..n]).await.map_err(sftp_err)?;
            transferred += n as u64;
            let _ = app.emit(
                EVENT_FILE_TRANSFER_PROGRESS,
                FileTransferProgressPayload {
                    transfer_id: transfer_id.to_string(),
                    connection_id: connection_id.to_string(),
                    direction: "download".to_string(),
                    filename: filename.clone(),
                    transferred,
                    total: total_size,
                    status: "active".to_string(),
                    error: None,
                },
            );
        }
        let _ = app.emit(
            EVENT_FILE_TRANSFER_PROGRESS,
            FileTransferProgressPayload {
                transfer_id: transfer_id.to_string(),
                connection_id: connection_id.to_string(),
                direction: "download".to_string(),
                filename,
                transferred,
                total: total_size,
                status: "done".to_string(),
                error: None,
            },
        );
        Ok(())
    }

    pub async fn upload_from_local(
        &self,
        local_path: &str,
        remote_path: &str,
        app: &tauri::AppHandle,
        connection_id: &str,
        transfer_id: &str,
    ) -> AppResult<()> {
        let mut local = File::open(local_path).await.map_err(sftp_err)?;
        let total_size = local.metadata().await.map_err(sftp_err)?.len();
        let mut remote = self
            .session
            .open_with_flags(
                remote_path,
                OpenFlags::WRITE | OpenFlags::CREATE | OpenFlags::TRUNCATE,
            )
            .await
            .map_err(sftp_err)?;
        let filename = local_path
            .rsplit('/')
            .next()
            .unwrap_or(local_path)
            .to_string();
        let chunk_size = 64 * 1024;
        let mut buffer = vec![0u8; chunk_size];
        let mut transferred = 0u64;
        loop {
            let n = local.read(&mut buffer).await.map_err(sftp_err)?;
            if n == 0 {
                break;
            }
            remote.write_all(&buffer[..n]).await.map_err(sftp_err)?;
            transferred += n as u64;
            let _ = app.emit(
                EVENT_FILE_TRANSFER_PROGRESS,
                FileTransferProgressPayload {
                    transfer_id: transfer_id.to_string(),
                    connection_id: connection_id.to_string(),
                    direction: "upload".to_string(),
                    filename: filename.clone(),
                    transferred,
                    total: total_size,
                    status: "active".to_string(),
                    error: None,
                },
            );
        }
        remote.flush().await.map_err(sftp_err)?;
        let _ = app.emit(
            EVENT_FILE_TRANSFER_PROGRESS,
            FileTransferProgressPayload {
                transfer_id: transfer_id.to_string(),
                connection_id: connection_id.to_string(),
                direction: "upload".to_string(),
                filename,
                transferred,
                total: total_size,
                status: "done".to_string(),
                error: None,
            },
        );
        Ok(())
    }

    pub async fn upload_from_bytes(
        &self,
        data: &[u8],
        remote_path: &str,
        app: &tauri::AppHandle,
        connection_id: &str,
        transfer_id: &str,
    ) -> AppResult<()> {
        let total_size = data.len() as u64;
        let mut remote = self
            .session
            .open_with_flags(
                remote_path,
                OpenFlags::WRITE | OpenFlags::CREATE | OpenFlags::TRUNCATE,
            )
            .await
            .map_err(sftp_err)?;
        let filename = remote_path
            .rsplit('/')
            .next()
            .unwrap_or(remote_path)
            .to_string();
        let chunk_size = 64 * 1024;
        let mut transferred = 0u64;
        while transferred < total_size {
            let end = (transferred + chunk_size as u64).min(total_size);
            remote
                .write_all(&data[transferred as usize..end as usize])
                .await
                .map_err(sftp_err)?;
            transferred = end;
            let _ = app.emit(
                EVENT_FILE_TRANSFER_PROGRESS,
                FileTransferProgressPayload {
                    transfer_id: transfer_id.to_string(),
                    connection_id: connection_id.to_string(),
                    direction: "upload".to_string(),
                    filename: filename.clone(),
                    transferred,
                    total: total_size,
                    status: "active".to_string(),
                    error: None,
                },
            );
        }
        remote.flush().await.map_err(sftp_err)?;
        let _ = app.emit(
            EVENT_FILE_TRANSFER_PROGRESS,
            FileTransferProgressPayload {
                transfer_id: transfer_id.to_string(),
                connection_id: connection_id.to_string(),
                direction: "upload".to_string(),
                filename,
                transferred,
                total: total_size,
                status: "done".to_string(),
                error: None,
            },
        );
        Ok(())
    }

    pub async fn canonicalize(&self, path: &str) -> AppResult<String> {
        self.session.canonicalize(path).await.map_err(sftp_err)
    }

    #[allow(dead_code)]
    pub async fn exists(&self, path: &str) -> AppResult<bool> {
        self.session.try_exists(path).await.map_err(sftp_err)
    }
}
