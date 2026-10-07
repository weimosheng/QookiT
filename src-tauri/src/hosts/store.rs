use std::path::PathBuf;

use aes_gcm::aead::{Aead, KeyInit};
use aes_gcm::{Aes256Gcm, Key, Nonce};
use base64::{engine::general_purpose::STANDARD, Engine as _};
use rand::RngCore;
use serde::{Deserialize, Serialize};

use crate::error::{AppError, AppResult};
use crate::hosts::model::{AuthMethod, Host, SystemInfo};

#[derive(Serialize, Deserialize)]
struct HostsFile {
    version: u32,
    hosts: Vec<HostRecord>,
}

#[derive(Serialize, Deserialize)]
struct HostRecord {
    id: String,
    name: String,
    host: String,
    port: u16,
    username: String,
    auth: AuthMethodRecord,
    group: Option<String>,
    initial_dir: Option<String>,
    system_info: Option<SystemInfo>,
    created_at: chrono::DateTime<chrono::Utc>,
    updated_at: chrono::DateTime<chrono::Utc>,
}

/// 落盘的认证记录。
///
/// 安全说明：
/// - `password_enc` / `passphrase_enc` / `key_content` 均为 AES-256-GCM 密文。
/// - `key_content` 字段名保留以向后兼容旧版明文存储：读取时解密失败则按明文处理，
///   下次 save 会自动重新加密落盘。
#[derive(Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
enum AuthMethodRecord {
    Password { password_enc: String },
    PrivateKey {
        key_content: String,
        passphrase_enc: Option<String>,
    },
}

struct Cipher {
    key: Vec<u8>,
}

impl Cipher {
    fn new(key: &[u8]) -> AppResult<Self> {
        if key.len() != 32 {
            return Err(AppError::Crypto("master key 必须为 32 字节".into()));
        }
        Ok(Self {
            key: key.to_vec(),
        })
    }

    fn encrypt(&self, plaintext: &str) -> AppResult<String> {
        let cipher = Aes256Gcm::new(Key::<Aes256Gcm>::from_slice(&self.key));
        let mut nonce_bytes = [0u8; 12];
        rand::thread_rng().fill_bytes(&mut nonce_bytes);
        let nonce = Nonce::from_slice(&nonce_bytes);
        let ciphertext = cipher
            .encrypt(nonce, plaintext.as_bytes())
            .map_err(|e| AppError::Crypto(e.to_string()))?;
        let mut out = Vec::with_capacity(12 + ciphertext.len());
        out.extend_from_slice(&nonce_bytes);
        out.extend_from_slice(&ciphertext);
        Ok(STANDARD.encode(&out))
    }

    fn decrypt(&self, data: &str) -> AppResult<String> {
        let raw = STANDARD
            .decode(data)
            .map_err(|e| AppError::Crypto(e.to_string()))?;
        if raw.len() < 12 {
            return Err(AppError::Crypto("密文过短".into()));
        }
        let (nonce_bytes, ciphertext) = raw.split_at(12);
        let cipher = Aes256Gcm::new(Key::<Aes256Gcm>::from_slice(&self.key));
        let nonce = Nonce::from_slice(nonce_bytes);
        let plaintext = cipher
            .decrypt(nonce, ciphertext)
            .map_err(|e| AppError::Crypto(e.to_string()))?;
        String::from_utf8(plaintext).map_err(|e| AppError::Crypto(e.to_string()))
    }
}

/// 在 Unix 上把文件权限收紧为仅属主可读写（0600），防止同机其他用户读取敏感凭据。
/// Windows 上配置目录默认按用户隔离，继承自 %APPDATA% 的 ACL 已足够，无需额外处理。
#[cfg(unix)]
fn restrict_to_owner(path: &std::path::Path) {
    use std::os::unix::fs::PermissionsExt;
    let _ = std::fs::set_permissions(path, PermissionsExt::from_mode(0o600));
}

#[cfg(not(unix))]
fn restrict_to_owner(_path: &std::path::Path) {}

/// OS keyring 服务名/账户名（Windows Credential Manager / macOS Keychain / Linux Secret Service）。
/// master key 优先存 keyring：离线/备份场景下经 DPAPI 等用户凭据加密，比明文文件更安全。
const KEYRING_SERVICE: &str = "QookiT";
const KEYRING_ACCOUNT: &str = "master-key";

fn keyring_entry() -> Option<keyring::Entry> {
    keyring::Entry::new(KEYRING_SERVICE, KEYRING_ACCOUNT).ok()
}

/// 加载 master key：优先 OS keyring，回退文件（兼容旧版或 keyring 不可用）。
/// 新 key 优先写 keyring，失败则写文件（0600）。旧文件读取后 best-effort 迁移到 keyring。
fn load_master_key(dir: &std::path::Path) -> AppResult<Vec<u8>> {
    if let Some(entry) = keyring_entry() {
        if let Ok(encoded) = entry.get_password() {
            if let Ok(key) = STANDARD.decode(encoded) {
                if key.len() == 32 {
                    return Ok(key);
                }
            }
        }
    }
    let key_path = dir.join(".masterkey");
    if key_path.exists() {
        let raw = std::fs::read(&key_path)?;
        let key = STANDARD
            .decode(raw)
            .map_err(|e| AppError::Crypto(e.to_string()))?;
        if key.len() != 32 {
            return Err(AppError::Crypto("master key 必须为 32 字节".into()));
        }
        if let Some(entry) = keyring_entry() {
            let _ = entry.set_password(&STANDARD.encode(&key));
        }
        return Ok(key);
    }
    let mut key = [0u8; 32];
    rand::thread_rng().fill_bytes(&mut key);
    let encoded = STANDARD.encode(key);
    let stored = keyring_entry()
        .map(|e| e.set_password(&encoded).is_ok())
        .unwrap_or(false);
    if !stored {
        std::fs::write(&key_path, &encoded)?;
        restrict_to_owner(&key_path);
    }
    Ok(key.to_vec())
}

pub struct HostStore {
    dir: PathBuf,
    cipher: Cipher,
}

impl HostStore {
    pub fn new(dir: PathBuf) -> AppResult<Self> {
        std::fs::create_dir_all(&dir)?;
        let key = load_master_key(&dir)?;
        let cipher = Cipher::new(&key)?;
        Ok(Self { dir, cipher })
    }

    fn hosts_file(&self) -> PathBuf {
        self.dir.join("hosts.json")
    }

    pub fn load(&self) -> AppResult<Vec<Host>> {
        let path = self.hosts_file();
        if !path.exists() {
            return Ok(Vec::new());
        }
        let content = std::fs::read_to_string(&path)?;
        let file: HostsFile = serde_json::from_str(&content)?;
        file.hosts
            .into_iter()
            .map(|r| self.record_to_host(r))
            .collect()
    }

    pub fn save(&self, hosts: &[Host]) -> AppResult<()> {
        let records: Vec<HostRecord> = hosts
            .iter()
            .map(|h| self.host_to_record(h))
            .collect::<AppResult<_>>()?;
        let file = HostsFile {
            version: 1,
            hosts: records,
        };
        let json = serde_json::to_string_pretty(&file)?;
        let path = self.hosts_file();
        let tmp = path.with_extension("json.tmp");
        std::fs::write(&tmp, json)?;
        restrict_to_owner(&tmp);
        crate::fsutil::safe_rename(&tmp, &path)?;
        Ok(())
    }

    fn host_to_record(&self, h: &Host) -> AppResult<HostRecord> {
        let auth = match &h.auth {
            AuthMethod::Password { password } => AuthMethodRecord::Password {
                password_enc: self.cipher.encrypt(password)?,
            },
            AuthMethod::PrivateKey {
                key_content,
                passphrase,
            } => AuthMethodRecord::PrivateKey {
                key_content: self.cipher.encrypt(key_content)?,
                passphrase_enc: match passphrase {
                    Some(p) => Some(self.cipher.encrypt(p)?),
                    None => None,
                },
            },
        };
        Ok(HostRecord {
            id: h.id.clone(),
            name: h.name.clone(),
            host: h.host.clone(),
            port: h.port,
            username: h.username.clone(),
            auth,
            group: h.group.clone(),
            initial_dir: h.initial_dir.clone(),
            system_info: h.system_info.clone(),
            created_at: h.created_at,
            updated_at: h.updated_at,
        })
    }

    fn record_to_host(&self, r: HostRecord) -> AppResult<Host> {
        let auth = match r.auth {
            AuthMethodRecord::Password { password_enc } => AuthMethod::Password {
                password: self.cipher.decrypt(&password_enc)?,
            },
            AuthMethodRecord::PrivateKey {
                key_content,
                passphrase_enc,
            } => AuthMethod::PrivateKey {
                // 兼容旧版明文存储：解密失败则按明文读取，save 时会重新加密落盘
                key_content: self
                    .cipher
                    .decrypt(&key_content)
                    .unwrap_or_else(|_| key_content.clone()),
                passphrase: match passphrase_enc {
                    Some(enc) => Some(self.cipher.decrypt(&enc)?),
                    None => None,
                },
            },
        };
        Ok(Host {
            id: r.id,
            name: r.name,
            host: r.host,
            port: r.port,
            username: r.username,
            auth,
            group: r.group,
            initial_dir: r.initial_dir,
            system_info: r.system_info,
            created_at: r.created_at,
            updated_at: r.updated_at,
        })
    }
}

#[allow(dead_code)]
pub fn default_store_dir() -> AppResult<PathBuf> {
    let base = dirs::config_dir()
        .ok_or_else(|| AppError::Other("无法定位配置目录".into()))?;
    Ok(base.join("QookiT"))
}
