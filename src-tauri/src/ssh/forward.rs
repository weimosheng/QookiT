use std::collections::HashMap;
use std::sync::Arc;

use russh::client::Msg;
use serde::Serialize;
use tauri::{AppHandle, Emitter};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::{TcpListener, TcpStream};
use tokio::sync::RwLock;
use tokio::task::JoinHandle;
use tokio_util::sync::CancellationToken;

use crate::error::{AppError, AppResult};
use crate::events::{ForwardStatePayload, EVENT_FORWARD_STATE};
use crate::ssh::Connection;

#[derive(Clone, Copy, Debug, Serialize, serde::Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum ForwardKind {
    /// 本地转发 (-L)：本地监听，经 SSH 转发到远程目标。
    Local,
    /// 远程转发 (-R)：远程监听，经 SSH 转发回本地目标。
    Remote,
    /// 动态转发 (-D)：本地 SOCKS5 代理，按每个连接的目标动态开 channel。
    Dynamic,
}

#[derive(Clone, Debug, Serialize)]
pub struct ForwardSpec {
    pub kind: ForwardKind,
    pub local_host: String,
    pub local_port: u16,
    pub remote_host: String,
    pub remote_port: u16,
}

#[derive(Clone, Debug, Serialize)]
pub struct ForwardInfo {
    pub id: String,
    pub spec: ForwardSpec,
    /// `starting` | `active` | `error` | `stopped`
    pub status: String,
    /// 实际监听端口（远程转发 port=0 由服务器选择时回传真实端口）。
    pub bound_port: u16,
    pub bytes_in: u64,
    pub bytes_out: u64,
    pub error: Option<String>,
}

struct ForwardEntry {
    cancel: CancellationToken,
    task: JoinHandle<()>,
    info: Arc<RwLock<ForwardInfo>>,
}

/// 单连接的转发管理器：维护该连接下所有活跃端口转发。
pub struct ForwardManager {
    map: HashMap<String, ForwardEntry>,
}

impl ForwardManager {
    pub fn new() -> Self {
        Self {
            map: HashMap::new(),
        }
    }

    /// 启动一条转发规则并纳入管理。
    ///
    /// 初始化（bind / tcpip_forward）在当前 async 上下文同步完成，状态确定后再 detach
    /// accept 循环 task。这样 `forward_add` 命令返回时状态已是 active/error，
    /// 前端 `list` 拿到最终状态，避免「active 事件先于 list 到达被忽略」的竞态。
    pub async fn spawn(
        &mut self,
        app: AppHandle,
        connection_id: String,
        forward_id: String,
        spec: ForwardSpec,
        connection: Connection,
    ) -> AppResult<()> {
        if self.map.contains_key(&forward_id) {
            return Err(AppError::Forward("转发 ID 已存在".into()));
        }
        let cancel = CancellationToken::new();
        let info = Arc::new(RwLock::new(ForwardInfo {
            id: forward_id.clone(),
            spec: spec.clone(),
            status: "starting".into(),
            bound_port: match spec.kind {
                ForwardKind::Remote => 0,
                _ => spec.local_port,
            },
            bytes_in: 0,
            bytes_out: 0,
            error: None,
        }));
        // 不 emit starting：该事件可能晚于前端 optimistic active 派发，把 active 覆盖回 starting。
        // 状态确定后由 set_active/set_error 直接 emit active/error。

        let task = match spec.kind {
            ForwardKind::Local => {
                let listener = TcpListener::bind((spec.local_host.as_str(), spec.local_port))
                    .await
                    .map_err(|e| {
                        AppError::Forward(format!(
                            "绑定 {}:{} 失败: {e}",
                            spec.local_host, spec.local_port
                        ))
                    })?;
                set_active(&info, &app, &connection_id, &forward_id, spec.local_port).await;
                tokio::spawn(accept_loop_local(
                    listener,
                    app,
                    connection_id,
                    forward_id.clone(),
                    spec,
                    connection,
                    cancel.clone(),
                    info.clone(),
                ))
            }
            ForwardKind::Dynamic => {
                let listener = TcpListener::bind((spec.local_host.as_str(), spec.local_port))
                    .await
                    .map_err(|e| {
                        AppError::Forward(format!(
                            "绑定 {}:{} 失败: {e}",
                            spec.local_host, spec.local_port
                        ))
                    })?;
                set_active(&info, &app, &connection_id, &forward_id, spec.local_port).await;
                tokio::spawn(accept_loop_dynamic(
                    listener,
                    app,
                    connection_id,
                    forward_id.clone(),
                    connection,
                    cancel.clone(),
                    info.clone(),
                ))
            }
            ForwardKind::Remote => {
                let bound = connection
                    .tcpip_forward(&spec.remote_host, spec.remote_port)
                    .await
                    .map_err(|e| AppError::Forward(format!("请求远程转发失败: {e}")))?;
                connection
                    .register_remote_forward(&spec.remote_host, bound, &spec.local_host, spec.local_port)
                    .await;
                set_active(&info, &app, &connection_id, &forward_id, bound).await;
                tokio::spawn(wait_cancel_remote(
                    connection,
                    spec.remote_host.clone(),
                    bound,
                    app,
                    connection_id,
                    forward_id.clone(),
                    cancel.clone(),
                    info.clone(),
                ))
            }
        };

        self.map.insert(
            forward_id,
            ForwardEntry {
                cancel,
                task,
                info,
            },
        );
        Ok(())
    }

    /// 停止并移除一条转发。
    pub async fn remove(&mut self, forward_id: &str) -> AppResult<()> {
        let entry = self
            .map
            .remove(forward_id)
            .ok_or_else(|| AppError::ForwardNotFound(forward_id.into()))?;
        entry.cancel.cancel();
        let _ = entry.task.await;
        Ok(())
    }

    /// 列出所有转发的当前快照。
    pub async fn list(&self) -> Vec<ForwardInfo> {
        let mut out = Vec::new();
        for entry in self.map.values() {
            out.push(entry.info.read().await.clone());
        }
        out
    }

    /// 连接断开时清理：取消所有转发 task。
    pub async fn shutdown(&mut self) {
        for (_, entry) in self.map.drain() {
            entry.cancel.cancel();
            let _ = entry.task.await;
        }
    }
}

impl Drop for ForwardManager {
    fn drop(&mut self) {
        for (_, entry) in self.map.drain() {
            entry.cancel.cancel();
            entry.task.abort();
        }
    }
}

async fn accept_loop_local(
    listener: TcpListener,
    app: AppHandle,
    connection_id: String,
    forward_id: String,
    spec: ForwardSpec,
    connection: Connection,
    cancel: CancellationToken,
    info: Arc<RwLock<ForwardInfo>>,
) {
    loop {
        tokio::select! {
            _ = cancel.cancelled() => break,
            res = listener.accept() => {
                let (stream, orig_addr) = match res {
                    Ok(p) => p,
                    Err(e) => {
                        set_error(&info, &app, &connection_id, &forward_id, format!("监听失败: {e}")).await;
                        break;
                    }
                };
                let conn = connection.clone();
                let app_c = app.clone();
                let cid = connection_id.clone();
                let fid = forward_id.clone();
                let info_c = info.clone();
                let spec_c = spec.clone();
                tokio::spawn(async move {
                    let channel = match conn
                        .open_direct_tcpip(
                            &spec_c.remote_host,
                            spec_c.remote_port,
                            orig_addr.ip().to_string(),
                            orig_addr.port(),
                        )
                        .await
                    {
                        Ok(c) => c,
                        Err(_) => return,
                    };
                    bridge(stream, channel, app_c, cid, fid, info_c).await;
                });
            }
        }
    }
    set_stopped(&info, &app, &connection_id, &forward_id).await;
}

async fn accept_loop_dynamic(
    listener: TcpListener,
    app: AppHandle,
    connection_id: String,
    forward_id: String,
    connection: Connection,
    cancel: CancellationToken,
    info: Arc<RwLock<ForwardInfo>>,
) {
    loop {
        tokio::select! {
            _ = cancel.cancelled() => break,
            res = listener.accept() => {
                let (mut stream, orig_addr) = match res {
                    Ok(p) => p,
                    Err(e) => {
                        set_error(&info, &app, &connection_id, &forward_id, format!("监听失败: {e}")).await;
                        break;
                    }
                };
                let conn = connection.clone();
                let app_c = app.clone();
                let cid = connection_id.clone();
                let fid = forward_id.clone();
                let info_c = info.clone();
                tokio::spawn(async move {
                    let (host, port) = match socks5_handshake(&mut stream).await {
                        Ok(t) => t,
                        Err(_) => return,
                    };
                    let channel = match conn
                        .open_direct_tcpip(&host, port, orig_addr.ip().to_string(), orig_addr.port())
                        .await
                    {
                        Ok(c) => c,
                        Err(_) => return,
                    };
                    bridge(stream, channel, app_c, cid, fid, info_c).await;
                });
            }
        }
    }
    set_stopped(&info, &app, &connection_id, &forward_id).await;
}

async fn wait_cancel_remote(
    connection: Connection,
    remote_host: String,
    bound: u16,
    app: AppHandle,
    connection_id: String,
    forward_id: String,
    cancel: CancellationToken,
    info: Arc<RwLock<ForwardInfo>>,
) {
    cancel.cancelled().await;
    let _ = connection.cancel_tcpip_forward(&remote_host, bound).await;
    connection.unregister_remote_forward(&remote_host, bound).await;
    set_stopped(&info, &app, &connection_id, &forward_id).await;
}

/// 双向桥接 TCP 流与 SSH channel。
///
/// 用 `Channel::into_stream()` 把 channel 转成 AsyncRead+AsyncWrite，
/// 再用 `copy_bidirectional` 一次完成双向复制。避免在 `select!` 里反复
/// drop/重建 `channel.wait()` future 导致丢消息（wait 不保证 cancel-safe）。
async fn bridge(
    mut stream: TcpStream,
    channel: russh::Channel<Msg>,
    app: AppHandle,
    connection_id: String,
    forward_id: String,
    info: Arc<RwLock<ForwardInfo>>,
) {
    let mut channel_stream = channel.into_stream();
    let result = tokio::io::copy_bidirectional(&mut stream, &mut channel_stream).await;
    let _ = stream.shutdown().await;
    let (bytes_out, bytes_in) = match result {
        Ok((a_to_b, b_to_a)) => (a_to_b, b_to_a),
        Err(_) => (0u64, 0u64),
    };
    update_bytes(&info, &app, &connection_id, &forward_id, bytes_in, bytes_out).await;
}

/// SOCKS5 握手：仅支持无认证 + CONNECT 命令，返回目标 (host, port)。
async fn socks5_handshake(stream: &mut TcpStream) -> Result<(String, u16), ()> {
    let mut hdr = [0u8; 2];
    stream.read_exact(&mut hdr).await.map_err(|_| ())?;
    if hdr[0] != 0x05 {
        return Err(());
    }
    let nmethods = hdr[1] as usize;
    let mut methods = vec![0u8; nmethods];
    stream.read_exact(&mut methods).await.map_err(|_| ())?;
    stream.write_all(&[0x05, 0x00]).await.map_err(|_| ())?;

    let mut req = [0u8; 4];
    stream.read_exact(&mut req).await.map_err(|_| ())?;
    if req[0] != 0x05 || req[1] != 0x01 {
        // 仅支持 CONNECT；失败则回 command not supported
        let _ = stream.write_all(&[0x05, 0x07, 0x00, 0x01, 0, 0, 0, 0]).await;
        return Err(());
    }
    let host = match req[3] {
        0x01 => {
            // IPv4
            let mut b = [0u8; 4];
            stream.read_exact(&mut b).await.map_err(|_| ())?;
            format!("{}.{}.{}.{}", b[0], b[1], b[2], b[3])
        }
        0x03 => {
            // 域名
            let mut len = [0u8; 1];
            stream.read_exact(&mut len).await.map_err(|_| ())?;
            let mut b = vec![0u8; len[0] as usize];
            stream.read_exact(&mut b).await.map_err(|_| ())?;
            String::from_utf8(b).map_err(|_| ())?
        }
        0x04 => {
            // IPv6：本实现暂以原始十六进制回传，由 SSH 服务端解析
            let mut b = [0u8; 16];
            stream.read_exact(&mut b).await.map_err(|_| ())?;
            let mut s = String::new();
            for (i, x) in b.iter().enumerate() {
                if i > 0 {
                    s.push(':');
                }
                s.push_str(&format!("{:02x}", x));
            }
            s
        }
        _ => return Err(()),
    };
    let mut port_buf = [0u8; 2];
    stream.read_exact(&mut port_buf).await.map_err(|_| ())?;
    let port = u16::from_be_bytes(port_buf);
    // 成功响应：VER REP RSV ATYP BND.ADDR BND.PORT
    stream
        .write_all(&[0x05, 0x00, 0x00, 0x01, 0, 0, 0, 0, 0, 0])
        .await
        .map_err(|_| ())?;
    Ok((host, port))
}

async fn set_active(
    info: &Arc<RwLock<ForwardInfo>>,
    app: &AppHandle,
    cid: &str,
    _fid: &str,
    bound: u16,
) {
    {
        let mut g = info.write().await;
        g.status = "active".into();
        g.bound_port = bound;
    }
    emit_state(app, cid, info).await;
}

async fn set_error(
    info: &Arc<RwLock<ForwardInfo>>,
    app: &AppHandle,
    cid: &str,
    _fid: &str,
    err: String,
) {
    {
        let mut g = info.write().await;
        g.status = "error".into();
        g.error = Some(err);
    }
    emit_state(app, cid, info).await;
}

async fn set_stopped(
    info: &Arc<RwLock<ForwardInfo>>,
    app: &AppHandle,
    cid: &str,
    _fid: &str,
) {
    {
        let mut g = info.write().await;
        g.status = "stopped".into();
    }
    emit_state(app, cid, info).await;
}

async fn update_bytes(
    info: &Arc<RwLock<ForwardInfo>>,
    app: &AppHandle,
    cid: &str,
    _fid: &str,
    bytes_in: u64,
    bytes_out: u64,
) {
    {
        let mut g = info.write().await;
        g.bytes_in = bytes_in;
        g.bytes_out = bytes_out;
    }
    emit_state(app, cid, info).await;
}

async fn emit_state(app: &AppHandle, connection_id: &str, info: &Arc<RwLock<ForwardInfo>>) {
    let g = info.read().await;
    let _ = app.emit(
        EVENT_FORWARD_STATE,
        ForwardStatePayload {
            connection_id: connection_id.to_string(),
            forward_id: g.id.clone(),
            status: g.status.clone(),
            bound_port: g.bound_port,
            bytes_in: g.bytes_in,
            bytes_out: g.bytes_out,
            error: g.error.clone(),
        },
    );
}
