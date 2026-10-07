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
use windows::core::Interface;
#[cfg(target_os = "windows")]
use windows::Services::Store::{StoreContext, StorePackageUpdateState};
#[cfg(target_os = "windows")]
use windows::Win32::Foundation::HWND;
#[cfg(target_os = "windows")]
use windows::Win32::System::WinRT::{RoInitialize, RO_INIT_SINGLETHREADED};
#[cfg(target_os = "windows")]
use windows::Win32::UI::Shell::IInitializeWithWindow;

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

/// 在专用 STA 线程上运行 Store 操作。
///
/// `StoreContext` 的 API（尤其 `RequestDownloadAndInstallStorePackageUpdatesAsync`）必须
/// 在带窗口句柄的 UI/STA 线程上调用，否则报 `0x80070578`（必须从 UI 线程调用）。
/// 桌面 Win32/MSIX 桥应用须用 `GetForWindow(hwnd, ...)` 把窗口句柄显式绑定到 context
/// （而非 `GetDefault()`，后者仅 UWP 可用）。STA 上用 `.get()` 阻塞等待，其内部跑消息泵，
/// 能处理商店弹出的下载/安装 UI 对话框；若用 `.join()` 不跑消息泵会卡死。
///
/// 专用线程避免在 tokio 线程池线程上 `RoInitialize(STA)` —— 线程池线程可能已被其他任务
/// 以 MTA 初始化，再初始化 STA 会返回 `RPC_E_CHANGED_MODE` 失败。
#[cfg(target_os = "windows")]
fn run_on_sta<T>(
    hwnd: isize,
    task: impl FnOnce(HWND) -> AppResult<T> + Send + 'static,
) -> AppResult<T>
where
    T: Send + 'static,
{
    let (tx, rx) = std::sync::mpsc::channel::<AppResult<T>>();
    std::thread::Builder::new()
        .name("store-update".into())
        .spawn(move || {
            let result = (|| {
                // STA 初始化；已初始化返回 S_FALSE，忽略。线程退出时 OS 自动清理公寓。
                let _ = unsafe { RoInitialize(RO_INIT_SINGLETHREADED) };
                task(HWND(hwnd as *mut std::ffi::c_void))
            })();
            let _ = tx.send(result);
        })
        .map_err(|e| AppError::Other(format!("无法启动 Store 线程：{e}")))?;
    rx.recv()
        .map_err(|e| AppError::Other(format!("Store 线程异常：{e}")))?
}

/// 查询商店是否有可用更新。
#[cfg(target_os = "windows")]
pub fn check(hwnd: isize) -> AppResult<StoreUpdateCheck> {
    run_on_sta(hwnd, |hwnd| {
        let context = StoreContext::GetDefault().map_err(store_err)?;
        // 桌面桥应用须把窗口句柄绑给 context，否则弹 UI 的 API 报 0x80070578
        if let Ok(init) = context.cast::<IInitializeWithWindow>() {
            let _ = unsafe { init.Initialize(hwnd) };
        }
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
pub fn install(hwnd: isize) -> AppResult<StoreUpdateInstall> {
    run_on_sta(hwnd, |hwnd| {
        let context = StoreContext::GetDefault().map_err(store_err)?;
        // 桌面桥应用须把窗口句柄绑给 context，否则弹 UI 的 API 报 0x80070578
        if let Ok(init) = context.cast::<IInitializeWithWindow>() {
            let _ = unsafe { init.Initialize(hwnd) };
        }
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
pub fn check(_hwnd: isize) -> AppResult<StoreUpdateCheck> {
    Err(AppError::Other(
        "Microsoft Store 更新仅适用于 Windows 版本".to_string(),
    ))
}

#[cfg(not(target_os = "windows"))]
pub fn install(_hwnd: isize) -> AppResult<StoreUpdateInstall> {
    Err(AppError::Other(
        "Microsoft Store 更新仅适用于 Windows 版本".to_string(),
    ))
}
