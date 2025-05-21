use tauri::{AppHandle, Window};

#[tauri::command]
pub(crate) fn quit(app: AppHandle) {
    app.exit(0);
}

#[tauri::command]
pub async fn set_always_on_top(window: Window, always_on_top: bool) -> Result<(), String> {
    println!("Should be on top: {always_on_top}");

    // Note: set_always_on_top is async in Tauri 2.x
    window.set_always_on_top(always_on_top).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn is_wayland() -> bool {
    match std::env::var("XDG_SESSION_TYPE") {
        Ok(session_type) => session_type.to_lowercase() == "wayland",
        Err(_) => false,
    }
}
