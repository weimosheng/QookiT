use std::sync::Arc;

use russh::ChannelMsg;
use russh::client::{self, Handle};
use russh::keys::{PrivateKeyWithHashAlg, PublicKey};
use serde::Serialize;
use tauri::{AppHandle, Emitter};
use tokio::sync::Mutex;
use tokio::time::{timeout, Duration};
use tokio_util::sync::CancellationToken;

use crate::error::{AppError, AppResult};
use crate::events::{ConnectionLogPayload, EVENT_CONNECTION_LOG};
use crate::hosts::AuthMethod;
use crate::ssh::auth::{resolve_credential, AuthCredential};
use crate::ssh::host_key::{self, HostKeyVerdict};
use crate::ssh::sftp::SftpManager;
use crate::ssh::terminal::TerminalChannel;

#[derive(Clone, Debug, Serialize)]
pub struct ExecResult {
    pub stdout: String,
    pub stderr: String,
    pub exit_code: i32,
}

const CONNECT_TIMEOUT: Duration = Duration::from_secs(10);
const AUTH_TIMEOUT: Duration = Duration::from_secs(10);

/// 客户端回调：负责主机密钥校验（TOFU）与握手阶段日志。
struct ClientHandler {
    app: AppHandle,
    host_id: String,
    host: String,
    port: u16,
}

impl ClientHandler {
    fn log(&self, step: &str, message: String, status: &str) {
        let _ = self.app.emit(
            EVENT_CONNECTION_LOG,
            ConnectionLogPayload {
                host_id: self.host_id.clone(),
                step: step.to_string(),
                message,
                status: status.to_string(),
            },
        );
    }
}

impl client::Handler for ClientHandler {
    type Error = russh::Error;

    /// 主机密钥校验：首次连接记录并放行，已记录且一致则放行，不一致则拒绝。
    async fn check_server_key(&mut self, key: &PublicKey) -> Result<bool, Self::Error> {
        let algorithm = host_key::algorithm(key);
        let fingerprint = host_key::fingerprint(key);
        match host_key::check(&self.host, self.port, key) {
            HostKeyVerdict::Trusted => {
                self.log(
                    "tcp",
                    format!("已确认主机密钥 {algorithm} {fingerprint}"),
                    "info",
                );
                Ok(true)
            }
            HostKeyVerdict::Unknown => {
                match host_key::learn(&self.host, self.port, key) {
                    Ok(path) => {
                        self.log(
                            "tcp",
                            format!(
                                "首次连接，已记录主机密钥 {algorithm} {fingerprint}（{}）",
                                path.display()
                            ),
                            "info",
                        );
                    }
                    Err(e) => {
                        // 记录失败不阻断连接，但必须让用户知道本次信任没有被保存。
                        self.log(
                            "tcp",
                            format!("无法记录主机密钥 {algorithm} {fingerprint}：{e}"),
                            "info",
                        );
                    }
                }
                Ok(true)
            }
            HostKeyVerdict::Changed { line } => {
                self.log(
                    "tcp",
                    format!(
                        "主机密钥与本地记录不一致，已中止连接：服务器提供 {algorithm} {fingerprint}，\
                         与 known_hosts 第 {line} 行不符。若确认服务器确实更换了密钥，\
                         请在连接中心点击该主机的钥匙按钮清除记录后重试",
                    ),
                    "error",
                );
                Ok(false)
            }
        }
    }
}

#[allow(dead_code)]
pub struct Connection {
    pub id: String,
    pub host: String,
    pub port: u16,
    pub username: String,
    handle: Arc<Mutex<Handle<ClientHandler>>>,
}

impl Connection {
    pub async fn connect(
        app: &AppHandle,
        host_id: &str,
        host: &str,
        port: u16,
        username: &str,
        auth: &AuthMethod,
        cancel: CancellationToken,
    ) -> AppResult<Self> {
        let emit_log = |step: &str, message: &str, status: &str| {
            let _ = app.emit(
                EVENT_CONNECTION_LOG,
                ConnectionLogPayload {
                    host_id: host_id.to_string(),
                    step: step.to_string(),
                    message: message.to_string(),
                    status: status.to_string(),
                },
            );
        };

        emit_log("resolve", &format!("正在解析主机 {}:{}...", host, port), "start");
        emit_log("resolve", &format!("主机 {}:{} 已解析", host, port), "success");

        let config = Arc::new(client::Config::default());
        let handler = ClientHandler {
            app: app.clone(),
            host_id: host_id.to_string(),
            host: host.to_string(),
            port,
        };

        emit_log("tcp", &format!("正在建立 TCP 连接 {}:{}...", host, port), "start");
        let mut handle: Handle<ClientHandler> = tokio::select! {
            r = timeout(CONNECT_TIMEOUT, client::connect(config, (host, port), handler)) => {
                match r {
                    Ok(Ok(h)) => h,
                    Ok(Err(e)) => {
                        emit_log("tcp", &format!("连接失败: {}", e), "error");
                        return Err(e.into());
                    }
                    Err(_) => {
                        emit_log("tcp", "连接超时：主机不可达或端口未开放", "error");
                        return Err(AppError::Ssh("连接超时".into()));
                    }
                }
            }
            _ = cancel.cancelled() => {
                emit_log("tcp", "连接已取消", "cancelled");
                return Err(AppError::Cancelled);
            }
        };
        emit_log("tcp", "TCP 连接已建立", "success");

        let cred = match resolve_credential(auth) {
            Ok(c) => c,
            Err(e) => {
                emit_log("auth", &format!("{}", e), "error");
                return Err(e);
            }
        };
        emit_log("auth", &format!("正在认证用户 {}...", username), "start");
        let auth_ok = match &cred {
            AuthCredential::Password(pw) => {
                emit_log("auth", "使用密码认证", "info");
                tokio::select! {
                    r = timeout(AUTH_TIMEOUT, handle.authenticate_password(username, pw)) => {
                        match r {
                            Ok(Ok(r)) => r,
                            Ok(Err(e)) => {
                                emit_log("auth", &format!("认证错误: {}", e), "error");
                                return Err(e.into());
                            }
                            Err(_) => {
                                emit_log("auth", "认证超时", "error");
                                return Err(AppError::Auth("认证超时".into()));
                            }
                        }
                    }
                    _ = cancel.cancelled() => {
                        emit_log("auth", "连接已取消", "cancelled");
                        return Err(AppError::Cancelled);
                    }
                }
            }
            AuthCredential::PublicKey(_) => {
                emit_log("auth", "使用公钥认证", "info");
                let AuthCredential::PublicKey(pair) = cred else {
                    unreachable!()
                };
                tokio::select! {
                    r = timeout(AUTH_TIMEOUT, handle.authenticate_publickey(
                        username,
                        PrivateKeyWithHashAlg::new(Arc::new(pair), None),
                    )) => {
                        match r {
                            Ok(Ok(r)) => r,
                            Ok(Err(e)) => {
                                emit_log("auth", &format!("认证错误: {}", e), "error");
                                return Err(e.into());
                            }
                            Err(_) => {
                                emit_log("auth", "认证超时", "error");
                                return Err(AppError::Auth("认证超时".into()));
                            }
                        }
                    }
                    _ = cancel.cancelled() => {
                        emit_log("auth", "连接已取消", "cancelled");
                        return Err(AppError::Cancelled);
                    }
                }
            }
        };
        if !auth_ok.success() {
            emit_log("auth", "认证失败：用户名或密码/密钥错误", "error");
            return Err(AppError::Auth("认证失败".into()));
        }
        emit_log("auth", &format!("用户 {} 认证成功", username), "success");

        let id = uuid::Uuid::new_v4().to_string();
        emit_log("ready", "连接已就绪", "success");

        Ok(Self {
            id,
            host: host.to_string(),
            port,
            username: username.to_string(),
            handle: Arc::new(Mutex::new(handle)),
        })
    }

    pub async fn open_terminal(
        &self,
        app: AppHandle,
        connection_id: String,
        terminal_id: String,
        cols: u32,
        rows: u32,
    ) -> AppResult<TerminalChannel> {
        let handle = self.handle.lock().await;
        let channel = handle.channel_open_session().await?;
        drop(handle);

        channel
            .request_pty(false, "xterm-256color", cols, rows, 0, 0, &[])
            .await?;
        channel.request_shell(true).await?;

        Ok(TerminalChannel::spawn(channel, app, connection_id, terminal_id))
    }

    pub async fn open_sftp(&self) -> AppResult<SftpManager> {
        let handle = self.handle.lock().await;
        let channel = handle.channel_open_session().await?;
        drop(handle);

        channel.request_subsystem(true, "sftp").await?;
        let sftp = russh_sftp::client::SftpSession::new(channel.into_stream())
            .await
            .map_err(|e| AppError::Sftp(e.to_string()))?;
        Ok(SftpManager::new(sftp))
    }

    pub async fn exec(&self, command: &str) -> AppResult<ExecResult> {
        let handle = self.handle.lock().await;
        let mut channel = handle.channel_open_session().await?;
        drop(handle);

        channel.exec(true, command).await?;

        let mut stdout = Vec::new();
        let mut stderr = Vec::new();
        let mut exit_code: Option<i32> = None;
        let mut got_eof = false;

        loop {
            let wait_dur = if got_eof {
                Duration::from_secs(5)
            } else {
                Duration::from_secs(30)
            };
            let msg = match timeout(wait_dur, channel.wait()).await {
                Ok(m) => m,
                Err(_) => {
                    if got_eof {
                        break;
                    }
                    return Err(AppError::Other(
                        "命令执行超时 (30s 无响应)".into(),
                    ));
                }
            };
            match msg {
                Some(ChannelMsg::Data { ref data }) => {
                    stdout.extend_from_slice(data.as_ref());
                }
                Some(ChannelMsg::ExtendedData { ref data, .. }) => {
                    stderr.extend_from_slice(data.as_ref());
                }
                Some(ChannelMsg::ExitStatus { exit_status }) => {
                    exit_code = Some(exit_status as i32);
                    break;
                }
                Some(ChannelMsg::Eof { .. }) => {
                    got_eof = true;
                }
                None => {
                    break;
                }
                _ => {}
            }
        }

        Ok(ExecResult {
            stdout: String::from_utf8_lossy(&stdout).into_owned(),
            stderr: String::from_utf8_lossy(&stderr).into_owned(),
            exit_code: exit_code.unwrap_or(-1),
        })
    }

    pub async fn disconnect(&self) -> AppResult<()> {
        let handle = self.handle.lock().await;
        let _ = timeout(
            Duration::from_secs(5),
            handle.disconnect(russh::Disconnect::ByApplication, "bye", "en"),
        )
        .await;
        Ok(())
    }
}
