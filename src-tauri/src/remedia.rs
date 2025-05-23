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
    app: tauri::AppHandle,
    idx: usize,
    url: String,
    title: Option<String>,
    width: Option<f64>,
    height: Option<f64>,
) -> Result<(), String> {
    // Determine if it's an internal asset or an external URL
    let webview_url = if url.starts_with("http://") || url.starts_with("https://") {
        WebviewUrl::External(url.parse().map_err(|e| format!("Failed to parse URL: {e}"))?)
    } else {
        // Assume it's an app asset if not an external URL (e.g., "index.html", "dashboard.html")
        WebviewUrl::App(url.into())
    };

    WebviewWindowBuilder::new(
        &app,
        format!("preview-win-{idx}"), // Unique label for the new window
        webview_url,   // This is where the magic happens!
    )
    .title(title.unwrap_or_else(|| "Preview".to_string()))
    .inner_size(width.unwrap_or(800.0), height.unwrap_or(600.0))
    .min_inner_size(320.0, 200.0) // Minimum size for resizing
    .build()
    .map_err(|e| e.to_string())?;

    Ok(())
}
