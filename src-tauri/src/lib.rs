use std::{
    io::{BufRead, BufReader},
    process::{Command, Stdio},
};

use tauri::{async_runtime::spawn, Emitter, Manager};
// use tauri_plugin_shell::ShellExt;

// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn download(window: tauri::Window, media_source_url: String) {
    let window = window.clone();

    spawn(async move {
        // let ytdlp_command = app.shell().ytdlp("yt-dlp").unwrap();

        // Build the yt-dlp command
        let mut cmd = Command::new("yt-dlp.exe");
        cmd.arg(media_source_url)
            .arg("--progress-template")
            .arg("download:remedia-%(progress.downloaded_bytes)s-%(progress.total_bytes)s-%(progress.eta)s")
            .arg("--newline")
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());

        let mut child = cmd.spawn().expect("Failed to spawn yt-dlp");

        let stdout = child.stdout.take().expect("Failed to open stdout");
        let stderr = child.stderr.take().expect("Failed to open stderr");

        let out_reader = BufReader::new(stdout);
        let err_reader = BufReader::new(stderr);

        for line in out_reader.lines() {
            if let Ok(line) = line {
                println!("{}", line);

                // Check if line starts with 'download:'
                if line.starts_with("remedia-") {
                    // Output format: remedia-7168-3098545-0
                    let ln_status = line.split('-').collect::<Vec<&str>>();
                    let downloaded_bytes = ln_status[1].parse::<f64>().unwrap();
                    let total_bytes = ln_status[2].parse::<f64>().unwrap();
                    // let eta = ln_status[3].parse::<f64>().unwrap_or(0.0);

                    if total_bytes > 0.0 {
                        let percent = downloaded_bytes / total_bytes * 100.0;
                        // Emit event to frontend
                        window.emit("download-progress", percent).unwrap();
                    }
                }
            }
        }

        // Handle child process errors
        for line in err_reader.lines() {
            if let Ok(line) = line {
                println!("Error: {}", line);
            }
        }

        // Wait for the child process to exit
        let status = child.wait().expect("Failed to wait on yt-dlp");
        if status.success() {
            window.emit("download-complete", ()).unwrap();
        } else {
            window.emit("download-error", ()).unwrap();
        }
    });
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    #[cfg(debug_assertions)]
    let devtools = tauri_plugin_devtools::init(); // initialize the plugin as early as possible

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(devtools)
        .plugin(tauri_plugin_clipboard_manager::init())
        .setup(|app| {
            #[cfg(debug_assertions)] // only include this code on debug builds
            app.get_webview_window("main").unwrap().open_devtools();
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![download])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
