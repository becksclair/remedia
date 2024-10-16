use tauri::AppHandle;

#[tauri::command]
pub(crate) fn quit(app: AppHandle) {
    app.exit(0);
}
