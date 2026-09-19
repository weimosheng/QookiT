use tokio::sync::mpsc;
use russh::ChannelMsg;
use russh::client::Msg;
use tauri::{AppHandle, Emitter};
use base64::{engine::general_purpose::STANDARD, Engine as _};

use crate::error::{AppError, AppResult};
use crate::events::{
    EVENT_TERMINAL_DATA, EVENT_TERMINAL_EXIT, TerminalDataPayload, TerminalExitPayload,
};

enum TerminalCommand {
    Write(Vec<u8>),
    Resize(u32, u32),
    Close,
}

pub struct TerminalChannel {
    pub id: String,
    sender: mpsc::UnboundedSender<TerminalCommand>,
}

impl TerminalChannel {
    pub fn spawn(
        channel: russh::Channel<Msg>,
        app: AppHandle,
        connection_id: String,
        terminal_id: String,
    ) -> Self {
        let (tx, mut rx) = mpsc::unbounded_channel::<TerminalCommand>();
        let app_for_data = app.clone();
        let conn_id = connection_id.clone();
        let term_id = terminal_id.clone();

        tokio::spawn(async move {
            let mut channel = channel;
            loop {
                tokio::select! {
                    cmd = rx.recv() => {
                        match cmd {
                            Some(TerminalCommand::Write(data)) => {
                                if channel.data(&data[..]).await.is_err() {
                                    break;
                                }
                            }
                            Some(TerminalCommand::Resize(cols, rows)) => {
                                channel.window_change(cols, rows, 0, 0).await.ok();
                            }
                            Some(TerminalCommand::Close) | None => {
                                channel.close().await.ok();
                                break;
                            }
                        }
                    }
                    msg = channel.wait() => {
                        match msg {
                            Some(ChannelMsg::Data { ref data }) => {
                                let payload = TerminalDataPayload {
                                    connection_id: conn_id.clone(),
                                    terminal_id: term_id.clone(),
                                    data: STANDARD.encode(data.as_ref()),
                                };
                                let _ = app_for_data.emit(EVENT_TERMINAL_DATA, payload);
                            }
                            Some(ChannelMsg::ExtendedData { ref data, .. }) => {
                                let payload = TerminalDataPayload {
                                    connection_id: conn_id.clone(),
                                    terminal_id: term_id.clone(),
                                    data: STANDARD.encode(data.as_ref()),
                                };
                                let _ = app_for_data.emit(EVENT_TERMINAL_DATA, payload);
                            }
                            Some(ChannelMsg::ExitStatus { exit_status }) => {
                                let payload = TerminalExitPayload {
                                    connection_id: conn_id.clone(),
                                    terminal_id: term_id.clone(),
                                    exit_code: Some(exit_status),
                                };
                                let _ = app_for_data.emit(EVENT_TERMINAL_EXIT, payload);
                                channel.close().await.ok();
                                break;
                            }
                            Some(ChannelMsg::Eof { .. }) | Some(ChannelMsg::Close { .. }) | None => {
                                let payload = TerminalExitPayload {
                                    connection_id: conn_id.clone(),
                                    terminal_id: term_id.clone(),
                                    exit_code: None,
                                };
                                let _ = app_for_data.emit(EVENT_TERMINAL_EXIT, payload);
                                break;
                            }
                            _ => {}
                        }
                    }
                }
            }
        });

        Self {
            id: terminal_id,
            sender: tx,
        }
    }

    pub fn write(&self, data: Vec<u8>) -> AppResult<()> {
        self.sender
            .send(TerminalCommand::Write(data))
            .map_err(|e| AppError::Other(e.to_string()))
    }

    pub fn resize(&self, cols: u32, rows: u32) -> AppResult<()> {
        self.sender
            .send(TerminalCommand::Resize(cols, rows))
            .map_err(|e| AppError::Other(e.to_string()))
    }

    pub fn close(&self) -> AppResult<()> {
        self.sender
            .send(TerminalCommand::Close)
            .map_err(|e| AppError::Other(e.to_string()))
    }
}
