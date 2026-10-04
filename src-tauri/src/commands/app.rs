//! 运行环境相关的只读命令。

use crate::error::AppResult;
use crate::packaging;
use crate::store_update::{self, StoreUpdateCheck, StoreUpdateInstall};

/// 当前应用是否由 MSIX / Microsoft Store 分发。
///
/// 前端据此把「检查更新」入口切换到 Microsoft Store 通道；商店版本无法自我更新。
#[tauri::command]
pub fn is_store_packaged() -> bool {
    packaging::is_store_managed()
}

/// 通过 Microsoft Store 官方接口查询是否有可用更新。
///
/// `StoreContext` 是阻塞调用（内部等待 WinRT 异步操作完成），因此放到阻塞线程执行。
#[tauri::command]
pub async fn check_store_updates() -> AppResult<StoreUpdateCheck> {
    tauri::async_runtime::spawn_blocking(store_update::check)
        .await
        .map_err(|e| crate::error::AppError::Other(format!("更新检查任务异常：{e}")))?
}

/// 交给 Microsoft Store 下载并安装更新（仅商店安装且已上架的版本可用）。
#[tauri::command]
pub async fn install_store_updates() -> AppResult<StoreUpdateInstall> {
    tauri::async_runtime::spawn_blocking(store_update::install)
        .await
        .map_err(|e| crate::error::AppError::Other(format!("更新安装任务异常：{e}")))?
}

/// 强制退出整个应用，跳过窗口关闭拦截。
#[tauri::command]
pub fn force_quit(app: tauri::AppHandle) {
    crate::FORCE_QUIT.store(true, std::sync::atomic::Ordering::SeqCst);
    app.exit(0);
}
