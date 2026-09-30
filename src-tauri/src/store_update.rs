//! Microsoft Store 官方更新通道（`Windows.Services.Store.StoreContext`）。
//!
//! 为什么不能用 Tauri updater：MSIX 的安装目录（`C:\Program Files\WindowsApps\...`）
//! 对应用只读，应用无法替换自身可执行文件。商店分发的版本必须由 Microsoft Store
//! 下载并安装更新，`StoreContext` 就是官方为此提供的接口 —— 它由商店自己完成部署，
//! 不违反商店政策，也不需要任何代码签名证书。
//!
//! 限制：该接口要求「应用由 Microsoft Store 安装」且「已上架」。
//! 侧载的 MSIX、安装包版本、尚未上架的包调用都会失败，上层据此回退为「打开商店更新页」。

use crate::error::{AppError, AppResult};

#[cfg(target_os = "windows")]
use windows::Services::Store::{StoreContext, StorePackageUpdateState};
#[cfg(target_os = "windows")]
use windows::Win32::System::WinRT::{RoInitialize, RO_INIT_MULTITHREADED};

/// 更新检查结果。
#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StoreUpdateCheck {
    pub available: bool,
    pub count: u32,
    /// 商店将其标记为「强制更新」
    pub mandatory: bool,
}

/// 更新安装结果。
#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StoreUpdateInstall {
    pub state: InstallState,
    pub message: String,
}

#[derive(Debug, Clone, Copy, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub enum InstallState {
    /// 没有可用更新
    UpToDate,
    /// 已下载并安装，等待用户重启
    Installed,
    /// 用户在商店界面取消
    Canceled,
    /// 其他未完成状态
    Failed,
}

#[cfg(target_os = "windows")]
fn store_err(e: windows::core::Error) -> AppError {
    AppError::Other(format!("Microsoft Store 接口调用失败：{e}"))
}

/// `StoreContext` 是 WinRT 对象，调用前线程必须已初始化 COM/WinRT 公寓。
/// 调用方在阻塞线程上执行，无需消息泵，因此统一使用 MTA。
#[cfg(target_os = "windows")]
fn with_mta<T>(task: impl FnOnce() -> AppResult<T>) -> AppResult<T> {
    // 已初始化会返回 S_FALSE、公寓模式冲突会返回 RPC_E_CHANGED_MODE，两种情况都无需处理；
    // 该线程来自线程池，不做 RoUninitialize，避免后续调用重复初始化。
    let _ = unsafe { RoInitialize(RO_INIT_MULTITHREADED) };
    task()
}

/// 查询商店是否有可用更新。
#[cfg(target_os = "windows")]
pub fn check() -> AppResult<StoreUpdateCheck> {
    with_mta(|| {
        let context = StoreContext::GetDefault().map_err(store_err)?;
        let updates = context
            .GetAppAndOptionalStorePackageUpdatesAsync()
            .map_err(store_err)?
            .join()
            .map_err(store_err)?;
        let count = updates.Size().map_err(store_err)?;
        let mandatory = if count > 0 {
            updates
                .GetAt(0)
                .map_err(store_err)?
                .Mandatory()
                .unwrap_or(false)
        } else {
            false
        };
        Ok(StoreUpdateCheck {
            available: count > 0,
            count,
            mandatory,
        })
    })
}

/// 交给 Microsoft Store 下载并安装更新（阻塞直到商店完成或取消）。
#[cfg(target_os = "windows")]
pub fn install() -> AppResult<StoreUpdateInstall> {
    with_mta(|| {
        let context = StoreContext::GetDefault().map_err(store_err)?;
        let updates = context
            .GetAppAndOptionalStorePackageUpdatesAsync()
            .map_err(store_err)?
            .join()
            .map_err(store_err)?;
        if updates.Size().map_err(store_err)? == 0 {
            return Ok(StoreUpdateInstall {
                state: InstallState::UpToDate,
                message: "已是最新版本".to_string(),
            });
        }
        let result = context
            .RequestDownloadAndInstallStorePackageUpdatesAsync(&updates)
            .map_err(store_err)?
            .join()
            .map_err(store_err)?;
        let state = result.OverallState().map_err(store_err)?;
        let (state, message) = if state == StorePackageUpdateState::Completed {
            (
                InstallState::Installed,
                "更新已安装，请重启应用".to_string(),
            )
        } else if state == StorePackageUpdateState::Canceled {
            (InstallState::Canceled, "更新已取消".to_string())
        } else {
            (
                InstallState::Failed,
                format!("更新未完成（StorePackageUpdateState = {}）", state.0),
            )
        };
        Ok(StoreUpdateInstall { state, message })
    })
}

/// 非 Windows 平台没有 Microsoft Store 通道。
#[cfg(not(target_os = "windows"))]
pub fn check() -> AppResult<StoreUpdateCheck> {
    Err(AppError::Other(
        "Microsoft Store 更新仅适用于 Windows 版本".to_string(),
    ))
}

#[cfg(not(target_os = "windows"))]
pub fn install() -> AppResult<StoreUpdateInstall> {
    Err(AppError::Other(
        "Microsoft Store 更新仅适用于 Windows 版本".to_string(),
    ))
}
