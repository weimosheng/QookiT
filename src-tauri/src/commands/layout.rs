use std::fs;
use std::path::PathBuf;

use crate::error::{AppError, AppResult};

fn layout_file_path() -> AppResult<PathBuf> {
    let base = dirs::config_dir()
        .ok_or_else(|| AppError::Other("无法定位配置目录".into()))?;
    Ok(base.join("QookiT").join("layouts.json"))
}

#[tauri::command]
pub fn read_layout_templates() -> AppResult<String> {
    let path = layout_file_path()?;
    if !path.exists() {
        return Ok("[]".to_string());
    }
    let content = fs::read_to_string(&path)?;
    Ok(content)
}

#[tauri::command]
pub fn write_layout_templates(content: String) -> AppResult<()> {
    let path = layout_file_path()?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    fs::write(&path, content)?;
    Ok(())
}
