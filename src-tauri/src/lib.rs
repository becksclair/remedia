use remedia::quit;
use tauri::Manager;

mod downloader;
mod remedia;

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
        builder = builder.plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            let _ = app
                .get_webview_window("main")
                .expect("no main window")
                .set_focus();
        }));
    }

    builder = builder.setup(|_app| {
        // #[cfg(debug_assertions)] // only include this code on debug builds
        // app.get_webview_window("main").unwrap().open_devtools();
        Ok(())
    });

    builder = builder.invoke_handler(tauri::generate_handler![
        downloader::get_media_info,
        downloader::download_media,
        remedia::set_always_on_top,
        remedia::is_wayland,
        quit
    ]);

    builder
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
