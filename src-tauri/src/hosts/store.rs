use std::path::PathBuf;

use aes_gcm::aead::{Aead, KeyInit};
use aes_gcm::{Aes256Gcm, Key, Nonce};
use base64::{engine::general_purpose::STANDARD, Engine as _};
use rand::RngCore;
use serde::{Deserialize, Serialize};

use crate::error::{AppError, AppResult};
use crate::hosts::model::{AuthMethod, Host};

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
    created_at: chrono::DateTime<chrono::Utc>,
    updated_at: chrono::DateTime<chrono::Utc>,
}

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

pub struct HostStore {
    dir: PathBuf,
    cipher: Cipher,
}

impl HostStore {
    pub fn new(dir: PathBuf) -> AppResult<Self> {
        std::fs::create_dir_all(&dir)?;
        let key_path = dir.join(".masterkey");
        let key = if key_path.exists() {
            let raw = std::fs::read(&key_path)?;
            STANDARD
                .decode(raw)
                .map_err(|e| AppError::Crypto(e.to_string()))?
        } else {
            let mut key = [0u8; 32];
            rand::thread_rng().fill_bytes(&mut key);
            let encoded = STANDARD.encode(key);
            std::fs::write(&key_path, encoded)?;
            key.to_vec()
        };
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
        std::fs::rename(&tmp, &path)?;
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
                key_content: key_content.clone(),
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
                key_content,
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
