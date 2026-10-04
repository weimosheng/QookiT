use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct SystemInfo {
    pub os: Option<String>,
    pub system: Option<String>,
    pub kernel: Option<String>,
    pub arch: Option<String>,
    pub cpu_cores: Option<u32>,
    pub mem_total_mb: Option<u64>,
    pub mem_available_mb: Option<u64>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Host {
    pub id: String,
    pub name: String,
    pub host: String,
    pub port: u16,
    pub username: String,
    pub auth: AuthMethod,
    pub group: Option<String>,
    pub initial_dir: Option<String>,
    pub system_info: Option<SystemInfo>,
    pub created_at: chrono::DateTime<chrono::Utc>,
    pub updated_at: chrono::DateTime<chrono::Utc>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum AuthMethod {
    Password { password: String },
    PrivateKey {
        key_content: String,
        passphrase: Option<String>,
    },
}

impl Host {
    #[allow(dead_code)]
    pub fn new(name: String, host: String, port: u16, username: String, auth: AuthMethod) -> Self {
        let now = chrono::Utc::now();
        Self {
            id: uuid::Uuid::new_v4().to_string(),
            name,
            host,
            port,
            username,
            auth,
            group: None,
            initial_dir: None,
            system_info: None,
            created_at: now,
            updated_at: now,
        }
    }
}
