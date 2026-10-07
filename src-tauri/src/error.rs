use thiserror::Error;

#[derive(Debug, Error)]
pub enum AppError {
    #[error("SSH 错误: {0}")]
    Ssh(String),
    #[error("SFTP 错误: {0}")]
    Sftp(String),
    #[error("认证失败: {0}")]
    Auth(String),
    #[error("连接未找到: {0}")]
    ConnectionNotFound(String),
    #[error("终端未找到: {0}")]
    TerminalNotFound(String),
    #[error("转发未找到: {0}")]
    ForwardNotFound(String),
    #[error("转发错误: {0}")]
    Forward(String),
    #[error("IO 错误: {0}")]
    Io(#[from] std::io::Error),
    #[error("序列化错误: {0}")]
    Serde(#[from] serde_json::Error),
    #[error("加密错误: {0}")]
    Crypto(String),
    #[error("主机未找到: {0}")]
    HostNotFound(String),
    #[error("分组未找到: {0}")]
    GroupNotFound(String),
    #[error("连接已取消")]
    Cancelled,
    #[error("{0}")]
    Other(String),
}

pub type AppResult<T> = Result<T, AppError>;

impl From<russh::Error> for AppError {
    fn from(e: russh::Error) -> Self {
        AppError::Ssh(e.to_string())
    }
}

impl From<russh::keys::Error> for AppError {
    fn from(e: russh::keys::Error) -> Self {
        AppError::Auth(e.to_string())
    }
}

impl serde::Serialize for AppError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        serializer.serialize_str(self.to_string().as_ref())
    }
}
