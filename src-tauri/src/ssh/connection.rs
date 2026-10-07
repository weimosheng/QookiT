use std::collections::HashMap;
use std::sync::Arc;

use russh::ChannelMsg;
use russh::client::{self, ChannelOpenHandle, Handle, Msg, Session};
use russh::keys::{PrivateKeyWithHashAlg, PublicKey};
use russh::ChannelOpenFailure;
use serde::Serialize;
use tauri::{AppHandle, Emitter};
use tokio::io::AsyncWriteExt;
use tokio::net::TcpStream;
use tokio::sync::{Mutex, RwLock};
use tokio::time::{timeout, Duration};
use tokio_util::sync::CancellationToken;

use crate::error::{AppError, AppResult};
use crate::events::{
    ConnectionLogPayload, HostKeyVerifyDonePayload, HostKeyVerifyPayload, EVENT_CONNECTION_LOG,
    EVENT_HOST_KEY_VERIFY, EVENT_HOST_KEY_VERIFY_DONE,
};
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
/// 首次连接等待用户确认主机密钥的超时时间，超时视为拒绝。
const HOST_KEY_CONFIRM_TIMEOUT: Duration = Duration::from_secs(120);

/// exec 单路 stdout/stderr 的输出上限，防止 `cat /dev/urandom` 等命令撑爆内存。
const MAX_EXEC_OUTPUT: usize = 64 * 1024 * 1024;

/// 远程转发表：key = (远程监听地址, 端口)，value = (本地目标地址, 端口)。
/// `server_channel_open_forwarded_tcpip` 据此把入站连接桥接回本地。
type RemoteForwardMap = Arc<RwLock<HashMap<(String, u16), (String, u16)>>>;

/// 客户端回调：负责主机密钥校验（TOFU）与握手阶段日志。
struct ClientHandler {
    app: AppHandle,
    host_id: String,
    host: String,
    port: u16,
    /// 连接取消令牌：取消连接时一并放弃等待主机密钥确认，避免挂起。
    cancel: CancellationToken,
    /// 远程转发规则表（与 Connection 共享同一份）。
    remote_forwards: RemoteForwardMap,
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

    /// 首次连接：把服务器密钥指纹交给用户核对，等待其确认。
    ///
    /// 返回 `true` 表示用户确认信任（调用方才写入 known_hosts）；
    /// 返回 `false` 表示用户拒绝、超时或连接被取消。
    async fn confirm_first_use(&self, algorithm: &str, fingerprint: &str) -> bool {
        use tauri::Manager;

        let request_id = uuid::Uuid::new_v4().to_string();
        let (tx, rx) = tokio::sync::oneshot::channel::<bool>();
        {
            let state = self.app.state::<crate::state::AppState>();
            state.pending_host_keys.lock().await.insert(
                request_id.clone(),
                crate::state::PendingHostKey {
                    host_id: self.host_id.clone(),
                    responder: tx,
                },
            );
        }

        self.log(
            "tcp",
            format!(
                "首次连接 {}:{}，请核对主机密钥 {algorithm} {fingerprint}",
                self.host, self.port
            ),
            "info",
        );
        let _ = self.app.emit(
            EVENT_HOST_KEY_VERIFY,
            HostKeyVerifyPayload {
                request_id: request_id.clone(),
                host: self.host.clone(),
                port: self.port,
                algorithm: algorithm.to_string(),
                fingerprint: fingerprint.to_string(),
            },
        );

        let accepted = tokio::select! {
            reply = rx => matches!(reply, Ok(true)),
            _ = self.cancel.cancelled() => false,
            _ = tokio::time::sleep(HOST_KEY_CONFIRM_TIMEOUT) => {
                self.log("tcp", "等待主机密钥确认超时，已中止连接".to_string(), "error");
                false
            }
        };

        // 无论结果如何都清理挂起项，避免连接取消/超时后残留（内存泄漏）。
        {
            let state = self.app.state::<crate::state::AppState>();
            state.pending_host_keys.lock().await.remove(&request_id);
        }
        // 通知前端关闭该确认对话框（用户已主动回应时前端会忽略此事件）。
        let _ = self.app.emit(
            EVENT_HOST_KEY_VERIFY_DONE,
            HostKeyVerifyDonePayload {
                request_id,
            },
        );

        accepted
    }
}

impl client::Handler for ClientHandler {
    type Error = russh::Error;

    /// 远程转发入站连接：查表找到本地目标，accept 后 spawn 双向桥接 task。
    ///
    /// 流量不在此处统计（入站连接与 ForwardManager 的 info 分属不同 task），
    /// 远程转发的 bytes_in/out 在面板上以占位符呈现。
    async fn server_channel_open_forwarded_tcpip(
        &mut self,
        channel: russh::Channel<Msg>,
        connected_address: &str,
        connected_port: u32,
        _originator_address: &str,
        _originator_port: u32,
        reply: ChannelOpenHandle,
        _session: &mut Session,
    ) -> Result<(), Self::Error> {
        let key = (connected_address.to_string(), connected_port as u16);
        let target = self.remote_forwards.read().await.get(&key).cloned();
        match target {
            Some((local_host, local_port)) => {
                reply.accept().await;
                tokio::spawn(async move {
                    match TcpStream::connect((local_host.as_str(), local_port)).await {
                        Ok(stream) => bridge_inbound(channel, stream).await,
                        Err(_) => {
                            let _ = channel.close().await;
                        }
                    }
                });
                Ok(())
            }
            None => {
                reply.reject(ChannelOpenFailure::AdministrativelyProhibited).await;
                Ok(())
            }
        }
    }

    /// 主机密钥校验：首次连接需用户确认后记录并放行，已记录且一致则放行，不一致则拒绝。
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
                // 首次连接：必须由用户核对指纹后确认，避免静默信任导致首次连接即被中间人劫持。
                if !self.confirm_first_use(&algorithm, &fingerprint).await {
                    self.log(
                        "tcp",
                        format!(
                            "未确认主机密钥 {algorithm} {fingerprint}，已中止连接"
                        ),
                        "error",
                    );
                    return Ok(false);
                }
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

#[derive(Clone)]
#[allow(dead_code)]
pub struct Connection {
    pub id: String,
    pub host: String,
    pub port: u16,
    pub username: String,
    handle: Arc<Mutex<Handle<ClientHandler>>>,
    remote_forwards: RemoteForwardMap,
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
        let remote_forwards: RemoteForwardMap = Arc::new(RwLock::new(HashMap::new()));
        let handler = ClientHandler {
            app: app.clone(),
            host_id: host_id.to_string(),
            host: host.to_string(),
            port,
            cancel: cancel.clone(),
            remote_forwards: remote_forwards.clone(),
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
            remote_forwards,
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
                    if stdout.len() > MAX_EXEC_OUTPUT {
                        return Err(AppError::Other(
                            "命令输出过大（超过 64 MB），已中止".into(),
                        ));
                    }
                }
                Some(ChannelMsg::ExtendedData { ref data, .. }) => {
                    stderr.extend_from_slice(data.as_ref());
                    if stderr.len() > MAX_EXEC_OUTPUT {
                        return Err(AppError::Other(
                            "命令错误输出过大（超过 64 MB），已中止".into(),
                        ));
                    }
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

    /// 开一条 direct-tcpip 通道（本地/动态转发用）。
    pub async fn open_direct_tcpip(
        &self,
        host_to_connect: &str,
        port_to_connect: u16,
        originator_address: String,
        originator_port: u16,
    ) -> AppResult<russh::Channel<Msg>> {
        let handle = self.handle.lock().await;
        let channel = handle
            .channel_open_direct_tcpip(
                host_to_connect.to_string(),
                port_to_connect as u32,
                originator_address,
                originator_port as u32,
            )
            .await?;
        Ok(channel)
    }

    /// 请求服务器监听指定地址端口（远程转发），返回实际监听端口。
    pub async fn tcpip_forward(&self, address: &str, port: u16) -> AppResult<u16> {
        let handle = self.handle.lock().await;
        let bound = handle
            .tcpip_forward(address.to_string(), port as u32)
            .await?;
        if bound > u16::MAX as u32 {
            return Err(AppError::Forward(format!("服务器返回端口过大: {bound}")));
        }
        Ok(bound as u16)
    }

    /// 取消服务器的远程监听。
    pub async fn cancel_tcpip_forward(&self, address: &str, port: u16) -> AppResult<()> {
        let handle = self.handle.lock().await;
        handle
            .cancel_tcpip_forward(address.to_string(), port as u32)
            .await?;
        Ok(())
    }

    /// 登记一条远程转发规则，供 `server_channel_open_forwarded_tcpip` 查表桥接。
    pub async fn register_remote_forward(
        &self,
        remote_addr: &str,
        remote_port: u16,
        local_host: &str,
        local_port: u16,
    ) {
        self.remote_forwards
            .write()
            .await
            .insert((remote_addr.to_string(), remote_port), (local_host.to_string(), local_port));
    }

    /// 移除一条远程转发规则。
    pub async fn unregister_remote_forward(&self, remote_addr: &str, remote_port: u16) {
        self.remote_forwards
            .write()
            .await
            .remove(&(remote_addr.to_string(), remote_port));
    }
}

/// 远程转发入站桥接：channel ↔ 本地 TcpStream 双向复制（不统计流量）。
async fn bridge_inbound(channel: russh::Channel<Msg>, mut stream: TcpStream) {
    let mut channel_stream = channel.into_stream();
    let _ = tokio::io::copy_bidirectional(&mut stream, &mut channel_stream).await;
    let _ = stream.shutdown().await;
}
