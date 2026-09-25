use russh_sftp::client::SftpSession;
use serde::Serialize;

use crate::error::{AppError, AppResult};

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

    pub async fn write_file(&self, path: &str, data: Vec<u8>) -> AppResult<()> {
        self.session.write(path, &data).await.map_err(sftp_err)
    }

    pub async fn canonicalize(&self, path: &str) -> AppResult<String> {
        self.session.canonicalize(path).await.map_err(sftp_err)
    }

    #[allow(dead_code)]
    pub async fn exists(&self, path: &str) -> AppResult<bool> {
        self.session.try_exists(path).await.map_err(sftp_err)
    }
}
