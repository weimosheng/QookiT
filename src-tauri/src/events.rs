pub const EVENT_TERMINAL_DATA: &str = "terminal:data";
pub const EVENT_TERMINAL_EXIT: &str = "terminal:exit";
#[allow(dead_code)]
pub const EVENT_CONNECTION_CLOSED: &str = "connection:closed";
pub const EVENT_CONNECTION_LOG: &str = "connection:log";

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
