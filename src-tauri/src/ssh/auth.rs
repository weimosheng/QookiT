use russh::keys::PrivateKey;

use crate::error::{AppError, AppResult};
use crate::hosts::AuthMethod;

pub enum AuthCredential {
    Password(String),
    PublicKey(PrivateKey),
}

pub fn resolve_credential(auth: &AuthMethod) -> AppResult<AuthCredential> {
    match auth {
        AuthMethod::Password { password } => Ok(AuthCredential::Password(password.clone())),
        AuthMethod::PrivateKey {
            key_content,
            passphrase,
        } => {
            let trimmed = key_content.trim();
            if trimmed.is_empty() {
                return Err(AppError::Auth("私钥内容为空，请填写私钥内容".into()));
            }
            if !trimmed.contains("-----BEGIN") {
                return Err(AppError::Auth(
                    "私钥格式无效，请确保填写的是私钥文件内容而非文件路径".into(),
                ));
            }
            let cleaned: String = key_content
                .lines()
                .map(|l| l.trim())
                .filter(|l| !l.is_empty())
                .collect::<Vec<_>>()
                .join("\n");
            let pair = russh::keys::decode_secret_key(&cleaned, passphrase.as_deref())
                .map_err(|e| AppError::Auth(format!("解析私钥失败: {e}")))?;
            Ok(AuthCredential::PublicKey(pair))
        }
    }
}
