use std::io::ErrorKind;
use std::path::Path;

use crate::error::{AppError, AppResult};

/// rename 的跨设备安全版本。
///
/// 先尝试 `std::fs::rename`（同设备时为原子操作）；
/// 若遇到「跨设备」错误（Windows `ERROR_NOT_SAME_DEVICE` / Unix `EXDEV`）则降级为
/// copy + delete，保证跨磁盘或挂载点场景下也能成功。
///
/// 用 `ErrorKind::CrossesDevices` 而非硬编码错误码：该码在 Windows 为 17、
/// 在 Unix 为 18，硬编码任一值都会在另一平台误判。
pub fn safe_rename(from: &Path, to: &Path) -> AppResult<()> {
    match std::fs::rename(from, to) {
        Ok(()) => Ok(()),
        Err(e) if e.kind() == ErrorKind::CrossesDevices => {
            std::fs::copy(from, to)?;
            let _ = std::fs::remove_file(from);
            Ok(())
        }
        Err(e) => Err(AppError::Io(e)),
    }
}
