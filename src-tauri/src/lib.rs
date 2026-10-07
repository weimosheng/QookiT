mod commands;
mod error;
mod events;
mod groups;
mod hosts;
mod packaging;
mod ssh;
mod state;
mod store_update;

use groups::GroupStore;
use hosts::HostStore;
use state::AppState;
use tauri::Emitter;

use std::sync::atomic::AtomicBool;
/// 标记 force_quit 已调用，避免 on_window_event 再次拦截关闭。
pub(crate) static FORCE_QUIT: AtomicBool = AtomicBool::new(false);

/// 启动阶段致命错误：GUI 模式下 panic 只会静默退出，
/// 因此这里用系统消息框把原因告诉用户，再退出进程。
fn fatal(message: &str) -> ! {
    eprintln!("QookiT 启动失败: {message}");
    log::error!("QookiT 启动失败: {message}");

    #[cfg(target_os = "windows")]
    {
        use std::ffi::c_void;

        #[link(name = "user32")]
        unsafe extern "system" {
            fn MessageBoxW(
                hwnd: *mut c_void,
                text: *const u16,
                caption: *const u16,
                u_type: u32,
            ) -> i32;
        }

        const MB_OK: u32 = 0x0000_0000;
        const MB_ICONERROR: u32 = 0x0000_0010;

        let to_wide = |s: &str| -> Vec<u16> {
            s.encode_utf16().chain(std::iter::once(0)).collect()
        };
        let text = to_wide(message);
        let caption = to_wide("QookiT 启动失败");
        // SAFETY: 两个指针都指向以 0 结尾的 UTF-16 缓冲区，且在调用期间存活。
        unsafe {
            MessageBoxW(
                std::ptr::null_mut(),
                text.as_ptr(),
                caption.as_ptr(),
                MB_OK | MB_ICONERROR,
            );
        }
    }

    std::process::exit(1)
}

fn init_state() -> crate::error::AppResult<AppState> {
    let dir = hosts::store::default_store_dir()?;
    let store = HostStore::new(dir.clone())?;
    let groups_store = GroupStore::new(dir)?;
    Ok(AppState::new(store, groups_store))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let _ = env_logger::try_init();

    let state = match init_state() {
        Ok(state) => state,
        Err(e) => fatal(&format!(
            "无法初始化本地数据目录（{}）：{e}",
            hosts::store::default_store_dir()
                .map(|p| p.display().to_string())
                .unwrap_or_else(|_| "未知路径".to_string())
        )),
    };

    // MSIX 安装目录对应用只读，自更新无法替换自身可执行文件；
    // 商店分发的版本改为依赖 Microsoft Store 推送更新，因此不注册 updater 插件。
    let store_packaged = packaging::is_store_managed();
    if store_packaged {
        log::info!("检测到 MSIX 包标识：已禁用自更新，更新由 Microsoft Store 提供");
    }

    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_os::init());

    let builder = if store_packaged {
        builder
    } else {
        builder.plugin(tauri_plugin_updater::Builder::new().build())
    };

    builder
        .manage(state)
        .setup(|app| {
            use tauri::Manager;
            use tauri::menu::{Menu, MenuItem};
            use tauri::tray::{TrayIconBuilder, TrayIconEvent};

            if let Some(win) = app.get_webview_window("main") {
                if let Ok(icon) =
                    tauri::image::Image::from_bytes(include_bytes!("../icons/icon.png"))
                {
                    let _ = win.set_icon(icon);
                }
            }

            let show_item = MenuItem::with_id(app, "show", "显示", true, None::<&str>)?;
            let quit_item = MenuItem::with_id(app, "quit", "退出", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show_item, &quit_item])?;
            let tray_icon =
                tauri::image::Image::from_bytes(include_bytes!("../icons/32x32.png"))?;
            TrayIconBuilder::new()
                .icon(tray_icon)
                .menu(&menu)
                .tooltip("QookiT")
                .show_menu_on_left_click(false)
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::DoubleClick { .. } = event {
                        let app = tray.app_handle();
                        if let Some(win) = app.get_webview_window("main") {
                            let _ = win.unminimize();
                            let _ = win.show();
                            let _ = win.set_focus();
                        }
                    }
                })
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "show" => {
                        if let Some(win) = app.get_webview_window("main") {
                            let _ = win.show();
                            let _ = win.set_focus();
                        }
                    }
                    "quit" => {
                        app.exit(0);
                    }
                    _ => {}
                })
                .build(app)?;

            Ok(())
        })
        .on_window_event(|window, event| {
            use tauri::Manager;
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                if !FORCE_QUIT.load(std::sync::atomic::Ordering::SeqCst) {
                    api.prevent_close();
                    let _ = window.app_handle().emit("close-requested", ());
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            commands::app::is_store_packaged,
            commands::app::force_quit,
            commands::app::check_store_updates,
            commands::app::install_store_updates,
            commands::hosts::list_hosts,
            commands::hosts::add_host,
            commands::hosts::update_host,
            commands::hosts::delete_host,
            commands::groups::list_groups,
            commands::groups::add_group,
            commands::groups::update_group,
            commands::groups::delete_group,
            commands::connection::connect_host,
            commands::connection::cancel_connect,
            commands::connection::respond_host_key,
            commands::connection::disconnect_host,
            commands::connection::ping_host,
            commands::connection::forget_host_key,
            commands::connection::known_host_fingerprints,
            commands::terminal::open_terminal,
            commands::terminal::terminal_write,
            commands::terminal::terminal_resize,
            commands::terminal::close_terminal,
            commands::sftp::sftp_open,
            commands::sftp::sftp_list_dir,
            commands::sftp::sftp_stat,
            commands::sftp::sftp_mkdir,
            commands::sftp::sftp_remove_file,
            commands::sftp::sftp_remove_dir,
            commands::sftp::sftp_rename,
            commands::sftp::sftp_read_file,
            commands::sftp::sftp_read_file_progress,
            commands::sftp::sftp_download_file,
            commands::sftp::sftp_upload_file,
            commands::sftp::sftp_upload_from_base64,
            commands::sftp::sftp_write_file,
            commands::sftp::sftp_canonicalize,
            commands::sftp::ssh_exec,
            commands::forward::forward_add,
            commands::forward::forward_remove,
            commands::forward::forward_list,
            commands::system_info::get_system_info,
            commands::performance::performance_sample,
            commands::systemd::systemd_list_units,
            commands::systemd::systemd_unit_status,
            commands::systemd::systemd_start,
            commands::systemd::systemd_stop,
            commands::systemd::systemd_restart,
            commands::systemd::systemd_enable,
            commands::systemd::systemd_disable,
            commands::systemd::systemd_get_logs,
            commands::systemd::systemd_cat_unit,
            commands::systemd::systemd_create_unit,
            commands::cron::cron_list_jobs,
            commands::cron::cron_get_crontab_raw,
            commands::cron::cron_set_crontab_raw,
            commands::cron::cron_get_logs,
            commands::cron::cron_list_system_files,
            commands::cron::cron_get_system_file,
            commands::cron::cron_write_system_file,
            commands::cron::cron_remove_system_file,
            commands::cron::cron_get_job_logs,
            commands::cron::cron_run_job,
            commands::layout::read_layout_templates,
            commands::layout::write_layout_templates,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
