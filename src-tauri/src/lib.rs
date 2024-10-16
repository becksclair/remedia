use downloader::{download, get_media_info};
use remedia::quit;
use tauri::Manager;
// use tauri_plugin_shell::ShellExt;

mod downloader;
mod remedia;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let mut builder = tauri::Builder::default();
    builder = builder
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

    // #[cfg(debug_assertions)]
    // {
    //     let devtools = tauri_plugin_devtools::init(); // initialize the plugin as early as possible
    //     builder = builder.plugin(devtools); // initialize the plugin as early as possible
    // }

    builder = builder.setup(|_app| {
        // #[cfg(debug_assertions)] // only include this code on debug builds
        // app.get_webview_window("main").unwrap().open_devtools();
        Ok(())
    });

    builder = builder
        .invoke_handler(tauri::generate_handler![get_media_info])
        .invoke_handler(tauri::generate_handler![download])
        .invoke_handler(tauri::generate_handler![quit]);

    builder
        .run(tauri::generate_context!())
        .expect("error while running tauri application");

    // #[cfg(debug_assertions)]
    // let devtools = tauri_plugin_devtools::init(); // initialize the plugin as early as possible
    // tauri::Builder::default()
    //     .plugin(tauri_plugin_single_instance::init(|app, args, cwd| {}))
    //     .plugin(tauri_plugin_fs::init())
    //     .plugin(tauri_plugin_dialog::init())
    //     .plugin(tauri_plugin_clipboard_manager::init())
    //     .plugin(tauri_plugin_shell::init())
    //     // .plugin(devtools)
    //     // .setup(|app| {
    //     //     #[cfg(debug_assertions)] // only include this code on debug builds
    //     //     // app.get_webview_window("main").unwrap().open_devtools();
    //     //     Ok(())
    //     // })
    //     .invoke_handler(tauri::generate_handler![get_media_info])
    //     .invoke_handler(tauri::generate_handler![download])
    //     .invoke_handler(tauri::generate_handler![quit])
    //     .run(tauri::generate_context!())
    //     .expect("error while running tauri application");
}
