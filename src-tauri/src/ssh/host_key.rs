//! 主机密钥校验：TOFU（首次信任并记录，之后必须一致）。
//!
//! 之前这里无条件信任服务器密钥，任何能劫持 TCP 的一方都能冒充目标主机（MITM）。
//! 现在改为：
//! - 本地无记录 → 首次连接，记录密钥后放行（TOFU，与 OpenSSH 默认行为一致）；
//! - 有记录且一致 → 放行；
//! - 有记录但不一致 → **拒绝连接**，并提示用户在连接中心清除记录后重试。
//!
//! 记录写入用户标准路径 `~/.ssh/known_hosts`，与 OpenSSH 及其他 SSH 客户端互通：
//! 用户在命令行 `ssh` 过的主机这里直接视为已信任，本应用记录的密钥命令行也认。

use std::collections::HashSet;
use std::path::PathBuf;

use russh::keys::known_hosts::{check_known_hosts, known_host_keys, learn_known_hosts};
use russh::keys::{Error as KeysError, HashAlg, PublicKey};

use crate::error::{AppError, AppResult};

/// 主机密钥校验结论。
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum HostKeyVerdict {
    /// 本地已有记录，且与服务器提供的密钥一致
    Trusted,
    /// 本地没有该主机的记录（首次连接）
    Unknown,
    /// 本地有记录但密钥不同：服务器更换了密钥，或存在中间人攻击
    Changed { line: usize },
}

/// 用户 known_hosts 文件路径（`~/.ssh/known_hosts`）。
pub fn known_hosts_path() -> AppResult<PathBuf> {
    dirs::home_dir()
        .map(|home| home.join(".ssh").join("known_hosts"))
        .ok_or_else(|| AppError::Other("无法定位用户主目录".into()))
}

/// SHA256 指纹，形如 `SHA256:AbCdEf...`。
pub fn fingerprint(key: &PublicKey) -> String {
    key.fingerprint(HashAlg::Sha256).to_string()
}

/// 密钥类型，如 `ssh-ed25519`。
pub fn algorithm(key: &PublicKey) -> String {
    key.algorithm().as_str().to_string()
}

/// 校验主机密钥。
///
/// 读取本地记录失败（文件损坏、无家目录等）时按「首次连接」处理：
/// 此时仍会尝试记录，并在日志中给出提示，避免因本地文件问题完全无法连接。
pub fn check(host: &str, port: u16, key: &PublicKey) -> HostKeyVerdict {
    match check_known_hosts(host, port, key) {
        Ok(true) => HostKeyVerdict::Trusted,
        Ok(false) => HostKeyVerdict::Unknown,
        Err(KeysError::KeyChanged { line }) => HostKeyVerdict::Changed { line },
        Err(_) => HostKeyVerdict::Unknown,
    }
}

/// 首次信任：把主机密钥追加写入 `~/.ssh/known_hosts`，返回写入的文件路径。
pub fn learn(host: &str, port: u16, key: &PublicKey) -> AppResult<PathBuf> {
    let path = known_hosts_path()?;
    learn_known_hosts(host, port, key)
        .map_err(|e| AppError::Other(format!("写入 known_hosts 失败：{e}")))?;
    Ok(path)
}

/// 清除该主机已记录的密钥，返回删除的条目数。
pub fn forget(host: &str, port: u16) -> AppResult<usize> {
    let path = known_hosts_path()?;
    if !path.exists() {
        return Ok(0);
    }
    let matched = known_host_keys(host, port)
        .map_err(|e| AppError::Other(format!("读取 known_hosts 失败：{e}")))?;
    if matched.is_empty() {
        return Ok(0);
    }
    let drop_lines: HashSet<usize> = matched.iter().map(|(line, _)| *line).collect();
    let content = std::fs::read_to_string(&path)?;
    // 用 split_inclusive 保留每行原有的换行符（含 CRLF），只剔除目标行，
    // 避免把整份文件的换行风格改写、破坏与 OpenSSH 的互操作性。
    let output: String = content
        .split_inclusive('\n')
        .enumerate()
        .filter(|(index, _)| !drop_lines.contains(&(index + 1)))
        .map(|(_, line)| line)
        .collect();

    // 先写同目录临时文件再原子替换，避免写入中断导致 known_hosts 损坏。
    let tmp = path.with_extension("tmp");
    std::fs::write(&tmp, output.as_bytes())?;
    if let Ok(meta) = std::fs::metadata(&path) {
        // 尽量沿用原文件权限，避免把 0600 变成默认权限。
        let _ = std::fs::set_permissions(&tmp, meta.permissions());
    }
    std::fs::rename(&tmp, &path)?;
    Ok(drop_lines.len())
}

/// 该主机已记录的主机密钥（`算法 指纹`），用于界面展示。
pub fn recorded(host: &str, port: u16) -> AppResult<Vec<String>> {
    let matched = known_host_keys(host, port)
        .map_err(|e| AppError::Other(format!("读取 known_hosts 失败：{e}")))?;
    Ok(matched
        .into_iter()
        .map(|(_, key)| format!("{} {}", algorithm(&key), fingerprint(&key)))
        .collect())
}
