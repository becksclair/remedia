// #[cfg(debug_assertions)]
use remedia::quit;
#[allow(unused_imports)]
use tauri::Manager;

pub mod download_queue;
pub mod downloader;
pub mod events;
pub mod remedia;
pub mod remote_control;
pub mod thumbnail;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let mut builder = tauri::Builder::default();
    builder = builder
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_shell::init());

    #[cfg(desktop)]
    {
        builder = builder.plugin(tauri_plugin_updater::Builder::new().build());

        #[cfg(not(target_os = "windows"))]
        {
            builder = builder.plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
                if let Some(window) = app.get_webview_window("main") {
                    if let Err(e) = window.set_focus() {
                        eprintln!("Failed to set focus on main window: {}", e);
                    }
                    if let Err(e) = window.show() {
                        eprintln!("Failed to show main window: {}", e);
                    }
                    if let Err(e) = window.unminimize() {
                        eprintln!("Failed to unminimize main window: {}", e);
                    }
                } else {
                    eprintln!("Main window not found when trying to focus on single instance");
                }
            }));
        }
    }

    builder = builder.setup(|app| {
        // #[cfg(debug_assertions)] // only include this code on debug builds
        // app.get_webview_window("main").unwrap().open_devtools();

        let enable_remote_env = std::env::var("ENABLE_REMOTE_HARNESS").ok();
        let enable_remote = enable_remote_env.as_deref().map(|v| v == "1").unwrap_or(cfg!(debug_assertions));
        eprintln!(
            "[remote] ENABLE_REMOTE_HARNESS env={:?} debug_fallback={} resolved={}",
            enable_remote_env,
            cfg!(debug_assertions),
            enable_remote
        );
        if enable_remote {
            eprintln!("[remote] ENABLE_REMOTE_HARNESS resolved true -> starting websocket bridge");
            remote_control::start_remote_control(app.app_handle().clone());
        } else {
            eprintln!("[remote] ENABLE_REMOTE_HARNESS not set; remote control disabled");
        }
        Ok(())
    });

    builder = builder.invoke_handler(tauri::generate_handler![
        downloader::get_media_info,
        downloader::expand_playlist,
        downloader::download_media,
        downloader::cancel_download,
        downloader::cancel_all_downloads,
        downloader::set_max_concurrent_downloads,
        downloader::get_queue_status,
        remedia::set_always_on_top,
        remedia::is_wayland,
        remedia::open_preview_window,
        quit
    ]);

    builder.run(tauri::generate_context!()).expect("error while running tauri application");
}
