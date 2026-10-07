pub const EVENT_TERMINAL_DATA: &str = "terminal:data";
pub const EVENT_TERMINAL_EXIT: &str = "terminal:exit";
#[allow(dead_code)]
pub const EVENT_CONNECTION_CLOSED: &str = "connection:closed";
pub const EVENT_CONNECTION_LOG: &str = "connection:log";
pub const EVENT_FILE_READ_PROGRESS: &str = "file:read_progress";
pub const EVENT_FILE_TRANSFER_PROGRESS: &str = "file:transfer_progress";
pub const EVENT_FORWARD_STATE: &str = "forward:state";
/// 首次连接：请求用户确认服务器主机密钥（TOFU）。
pub const EVENT_HOST_KEY_VERIFY: &str = "host-key:verify";
/// 该确认请求已结束（信任 / 拒绝 / 超时 / 连接被取消），前端据此关闭对话框。
pub const EVENT_HOST_KEY_VERIFY_DONE: &str = "host-key:verify-done";

#[derive(Clone, serde::Serialize)]
pub struct TerminalDataPayload {
    pub connection_id: String,
    pub terminal_id: String,
    pub data: String,
}

#[derive(Clone, serde::Serialize)]
pub struct TerminalExitPayload {
    pub connection_id: String,
    pub terminal_id: String,
    pub exit_code: Option<u32>,
}

#[allow(dead_code)]
#[derive(Clone, serde::Serialize)]
pub struct ConnectionClosedPayload {
    pub connection_id: String,
    pub reason: String,
}

#[derive(Clone, serde::Serialize)]
pub struct ConnectionLogPayload {
    pub host_id: String,
    pub step: String,
    pub message: String,
    pub status: String,
}

#[derive(Clone, serde::Serialize)]
pub struct FileReadProgressPayload {
    pub connection_id: String,
    pub path: String,
    pub read_bytes: u64,
    pub total_bytes: u64,
}

#[derive(Clone, serde::Serialize)]
pub struct FileTransferProgressPayload {
    pub transfer_id: String,
    pub connection_id: String,
    pub direction: String,
    pub filename: String,
    pub transferred: u64,
    pub total: u64,
    pub status: String,
    pub error: Option<String>,
}

/// 首次连接时展示给用户的服务器主机密钥信息。
#[derive(Clone, serde::Serialize)]
pub struct HostKeyVerifyPayload {
    pub request_id: String,
    pub host: String,
    pub port: u16,
    /// 密钥算法，如 `ssh-ed25519`
    pub algorithm: String,
    /// SHA256 指纹，形如 `SHA256:AbCdEf...`
    pub fingerprint: String,
}

/// 主机密钥确认结束通知。
#[derive(Clone, serde::Serialize)]
pub struct HostKeyVerifyDonePayload {
    pub request_id: String,
}

/// 端口转发状态变更通知（启动/就绪/出错/停止/流量更新）。
#[derive(Clone, serde::Serialize)]
pub struct ForwardStatePayload {
    pub connection_id: String,
    pub forward_id: String,
    /// `starting` | `active` | `error` | `stopped`
    pub status: String,
    /// 实际监听端口：远程转发 port=0 时由服务器选择，此处回传真实端口；其余同入参。
    pub bound_port: u16,
    pub bytes_in: u64,
    pub bytes_out: u64,
    pub error: Option<String>,
}
