use std::io::BufRead;
use std::io::BufReader;
use std::process::Command;
use std::process::Stdio;

use tauri::async_runtime::spawn;
use tauri::AppHandle;
use tauri::Emitter;
use tauri::Window;

#[tauri::command]
pub(crate) async fn get_media_info(
    _app: AppHandle,
    window: Window,
    media_source_url: String,
) -> Result<(), String> {
    spawn(async move {
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

        out_reader.lines().for_each(|line| {
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
        });

        // Handle child process errors
        err_reader.lines().for_each(|line| {
            if let Ok(line) = line {
                println!("Error: {}", line);
            }
        });

        // Wait for the child process to exit
        let status = child.wait().expect("Failed to wait on yt-dlp");
        if status.success() {
            window.emit("download-complete", ()).unwrap();
        } else {
            window.emit("download-error", ()).unwrap();
        }
    });

    Ok(())
}

// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
pub(crate) fn download(_app: AppHandle, window: Window, media_source_url: String) {
    let window = window.clone();

    spawn(async move {
        // let ytdlp_command = app.shell().sidecar("yt-dlp").unwrap();
        // ytdlp_command.arg(media_source_url)
        //     .arg("--progress-template")
        //     .arg("download:remedia-%(progress.downloaded_bytes)s-%(progress.total_bytes)s-%(progress.eta)s")
        //     .arg("--newline")
        //     .stdout(Stdio::piped())
        //     .stderr(Stdio::piped());

        // let mut child = ytdlp_command.spawn().expect("Failed to spawn yt-dlp");

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

        out_reader.lines().for_each(|line| {
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
        });

        // Handle child process errors
        err_reader.lines().for_each(|line| {
            if let Ok(line) = line {
                println!("Error: {}", line);
            }
        });

        // Wait for the child process to exit
        let status = child.wait().expect("Failed to wait on yt-dlp");
        if status.success() {
            window.emit("download-complete", ()).unwrap();
        } else {
            window.emit("download-error", ()).unwrap();
        }
    });
}
