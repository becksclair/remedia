// #[cfg(debug_assertions)]
use remedia::quit;
use tauri::Emitter;
#[allow(unused_imports)]
use tauri::Manager;

/// Custom error type for app setup failures.
/// Provides clearer error context than generic io::Error.
#[derive(Debug)]
struct SetupError(String);

impl std::fmt::Display for SetupError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "App setup failed: {}", self.0)
    }
}

impl std::error::Error for SetupError {}

pub mod download_queue;
pub mod downloader;
pub mod error;
pub mod events;
pub mod logging;
pub mod redgifs;
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

        // Start the download queue pump so enqueued downloads can execute.
        if let Err(e) = downloader::start_queue_pump(app.app_handle().clone()) {
            // Log and fail setup so the app doesn't start in a non-functional state
            crate::logging::log_error_simple(
                &app.app_handle(),
                crate::logging::ErrorCategory::System,
                "Failed to initialize download queue pump",
                Some(&e),
            );

            // Emit a custom startup error event that the frontend can catch and display
            // in a nicer UI. This allows the frontend to show a friendly error dialog.
            let error_message = format!("Failed to initialize download subsystem: {}", e);
            if let Some(window) = app.get_window("main") {
                let _ = window.emit(crate::events::EVT_STARTUP_ERROR, &error_message);
            }

            return Err(Box::new(SetupError(e)));
        }

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
        downloader::commands::get_media_info,
        downloader::commands::expand_playlist,
        downloader::commands::download_media,
        downloader::commands::cancel_download,
        downloader::commands::cancel_all_downloads,
        downloader::commands::set_max_concurrent_downloads,
        downloader::commands::get_queue_status,
        remedia::set_always_on_top,
        remedia::is_wayland,
        remedia::is_wsl,
        remedia::is_wsl2,
        remedia::get_wsl_window_close_behavior,
        remedia::open_preview_window,
        quit,
        #[cfg(debug_assertions)]
        remote_control::debug_broadcast
    ]);

    builder.run(tauri::generate_context!()).expect("error while running tauri application");
}
