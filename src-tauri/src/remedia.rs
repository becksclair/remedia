use tauri::{AppHandle, WebviewUrl, WebviewWindowBuilder, Window};

#[tauri::command]
pub(crate) fn quit(app: AppHandle) {
    app.exit(0);
}

#[tauri::command]
pub async fn set_always_on_top(window: Window, always_on_top: bool) -> Result<(), String> {
    #[cfg(not(any(target_os = "ios", target_os = "android")))]
    {
        println!("Should be on top: {always_on_top}");
        window.set_always_on_top(always_on_top).map_err(|e| e.to_string())?;
    }

    #[cfg(any(target_os = "ios", target_os = "android"))]
    {
        // No-op on iOS and Android
    }

    Ok(())
}

#[tauri::command]
pub fn is_wayland() -> bool {
    match std::env::var("XDG_SESSION_TYPE") {
        Ok(session_type) => session_type.to_lowercase() == "wayland",
        Err(_) => false,
    }
}

#[tauri::command]
pub fn open_preview_window(
    app: AppHandle,
    url: String,
    title: Option<String>,
    width: Option<f64>,
    height: Option<f64>,
) -> Result<(), String> {
    // Build the correct WebviewUrl; ensure leading slash for App routes
    let webview_url = if url.starts_with("http://") || url.starts_with("https://") {
        WebviewUrl::External(url.parse().map_err(|e| format!("Failed to parse URL: {e}"))?)
    } else {
        WebviewUrl::App(format!("/{}", url.trim_start_matches('/')).into())
    };

    // Reuse existing preview window if it exists
    // if let Some(win) = app.get_webview_window("preview-win") {
    //     if let Some(t) = title.clone() {
    //         let _ = win.set_title(&t);
    //     }

    //     if url.starts_with("http://") || url.starts_with("https://") {
    //         win.navigate(url.parse().map_err(|e| format!("Failed to parse URL: {e}"))?)
    //         .map_err(|e| format!("Failed to navigate preview window: {e}"))?;
    //     } else {
    //         win.navigate(format!("/{}", url.trim_start_matches('/')).parse().map_err(|e| format!("Failed to parse URL: {e}"))?)
    //         .map_err(|e| format!("Failed to navigate preview window: {e}"))?;
    //     };

    //     return Ok(());
    // }

    let _window = WebviewWindowBuilder::new(&app, "preview-win", webview_url)
        .title(title.unwrap_or_else(|| "ReMedia Preview".to_string()))
        .inner_size(width.unwrap_or(800.0), height.unwrap_or(600.0))
        .min_inner_size(320.0, 200.0)
        .resizable(true)
        .closable(true)
        .decorations(true)
        .build()
        .map_err(|e| format!("Failed to build preview window: {e}"))?;

    #[cfg(debug_assertions)]
    _window.open_devtools();

    println!("Preview window opened successfully");
    Ok(())
}

#[tauri::command]
pub fn is_wsl() -> bool {
    is_wsl::is_wsl()
}

#[tauri::command]
pub fn is_wsl2() -> bool {
    // WSL2 can be detected by checking if we're in WSL and /proc/version contains "WSL2"
    if !is_wsl::is_wsl() {
        return false;
    }

    match std::fs::read_to_string("/proc/version") {
        Ok(content) => content.contains("WSL2"),
        Err(_) => false,
    }
}

#[tauri::command]
pub fn get_wsl_window_close_behavior() -> String {
    if is_wsl2() {
        "wsl2".to_string()
    } else if is_wsl::is_wsl() {
        "wsl1".to_string()
    } else {
        "native".to_string()
    }
}
