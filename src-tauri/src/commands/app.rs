//! 运行环境相关的只读命令。

#[cfg(target_os = "windows")]
use tauri::Manager;

use crate::error::{AppError, AppResult};
use crate::packaging;
use crate::store_update::{self, StoreUpdateCheck, StoreUpdateInstall};

/// 当前应用是否由 MSIX / Microsoft Store 分发。
///
/// 前端据此把「检查更新」入口切换到 Microsoft Store 通道；商店版本无法自我更新。
#[tauri::command]
pub fn is_store_packaged() -> bool {
    packaging::is_store_managed()
}

/// 取主窗口 HWND（转 isize 解耦 tauri 与项目 windows crate 的版本）。
///
/// `StoreContext::GetForWindow` 必须传窗口句柄，否则商店 API 报 `0x80070578`。
#[cfg(target_os = "windows")]
fn main_hwnd(app: &tauri::AppHandle) -> AppResult<isize> {
    let win = app
        .get_webview_window("main")
        .ok_or_else(|| AppError::Other("主窗口未找到".into()))?;
    let hwnd = win
        .hwnd()
        .map_err(|e| AppError::Other(format!("获取窗口句柄失败：{e}")))?;
    Ok(hwnd.0 as isize)
}

/// 非 Windows 平台没有窗口句柄，也没有 Microsoft Store 通道。
///
/// 注意：`WebviewWindow::hwnd()` 是 Tauri 的 Windows-only API，
/// 因此这里必须用 cfg 分平台提供实现，否则 Linux / macOS 构建会报 E0599。
#[cfg(not(target_os = "windows"))]
fn main_hwnd(_app: &tauri::AppHandle) -> AppResult<isize> {
    Err(AppError::Other(
        "Microsoft Store 更新仅适用于 Windows 版本".to_string(),
    ))
}

/// 通过 Microsoft Store 官方接口查询是否有可用更新。
///
/// `StoreContext` 必须在带窗口句柄的 STA 线程上调用，内部起专用线程执行。
#[tauri::command]
pub async fn check_store_updates(app: tauri::AppHandle) -> AppResult<StoreUpdateCheck> {
    let hwnd = main_hwnd(&app)?;
    tauri::async_runtime::spawn_blocking(move || store_update::check(hwnd))
        .await
        .map_err(|e| AppError::Other(format!("更新检查任务异常：{e}")))?
}

/// 交给 Microsoft Store 下载并安装更新（仅商店安装且已上架的版本可用）。
#[tauri::command]
pub async fn install_store_updates(app: tauri::AppHandle) -> AppResult<StoreUpdateInstall> {
    let hwnd = main_hwnd(&app)?;
    tauri::async_runtime::spawn_blocking(move || store_update::install(hwnd))
        .await
        .map_err(|e| AppError::Other(format!("更新安装任务异常：{e}")))?
}

/// 强制退出整个应用，跳过窗口关闭拦截。
#[tauri::command]
pub fn force_quit(app: tauri::AppHandle) {
    crate::FORCE_QUIT.store(true, std::sync::atomic::Ordering::SeqCst);
    app.exit(0);
}
