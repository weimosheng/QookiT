//! 运行环境判定：当前进程是否以 MSIX 包身份运行（含 Microsoft Store 安装）。
//!
//! 为什么需要这个判定：MSIX 安装目录（`C:\Program Files\WindowsApps\...`）对应用是
//! **只读**的，应用无法替换自身可执行文件，因此 Tauri 的自更新在打包运行时必然失败。
//! 商店分发的版本必须改用 Microsoft Store 推送更新，所以这里要在运行期把两条分发
//! 链路区分开（同一个二进制同时服务 NSIS / 便携版 / MSIX，无法只在编译期区分）。

/// 进程是否拥有 Windows 包标识（package identity）。
///
/// MSIX / Microsoft Store 安装的应用由 Windows 授予包标识；
/// 直接运行 exe 或通过 NSIS 安装的版本没有包标识。
#[cfg(target_os = "windows")]
pub fn has_package_identity() -> bool {
    /// `GetCurrentPackageFullName` 在进程没有包标识时的返回值。
    const APPMODEL_ERROR_NO_PACKAGE: u32 = 15_700;

    // 该 API 自 Windows 8 起存在于 kernel32；本项目实际运行环境为 Windows 10+。
    #[link(name = "kernel32")]
    unsafe extern "system" {
        /// 传入空名称缓冲区时返回 `ERROR_INSUFFICIENT_BUFFER`，并把所需长度写入首参。
        fn GetCurrentPackageFullName(
            package_full_name_length: *mut u32,
            package_full_name: *mut u16,
        ) -> u32;
    }

    let mut length: u32 = 0;
    // SAFETY: 长度指针指向有效的栈变量；名称指针为 NULL，表示只查询缓冲区大小，
    // 该调用不会向名称缓冲区写入任何数据。
    let status = unsafe { GetCurrentPackageFullName(&mut length, std::ptr::null_mut()) };

    status != APPMODEL_ERROR_NO_PACKAGE
}

/// 非 Windows 平台不存在 MSIX，恒为 `false`。
#[cfg(not(target_os = "windows"))]
pub fn has_package_identity() -> bool {
    false
}

/// 当前安装形态的更新是否由 Microsoft Store 托管。
///
/// 为 `true` 时上层应当：不注册自更新插件、不在界面提供「检查更新」入口。
pub fn is_store_managed() -> bool {
    has_package_identity()
}
