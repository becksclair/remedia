use std::io::BufRead;
use std::io::BufReader;
use std::io::Read;
use std::path;
use std::process::Command;
use std::process::Stdio;

use serde_json::Value;
use tauri::AppHandle;
use tauri::Emitter;
use tauri::Window;
use tauri::async_runtime::spawn;

async fn run_yt_dlp(cmd: &mut Command) -> Result<(String, String), std::io::Error> {
    let mut child = cmd.spawn()?;

    let stdout = child.stdout.take().ok_or_else(|| std::io::Error::other("Could not capture stdout"))?;
    let stderr = child.stderr.take().ok_or_else(|| std::io::Error::other("Could not capture stderr"))?;

    let mut out_reader = BufReader::new(stdout);
    let err_reader = BufReader::new(stderr);

    let mut output = String::new();
    out_reader.read_to_string(&mut output)?;

    let mut errors = String::new();
    for line in err_reader.lines() {
        errors.push_str(&line?);
        errors.push('\n');
    }

    child.wait()?;

    Ok((output, errors))
}

#[tauri::command]
pub async fn get_media_info(
    _app: AppHandle,
    window: Window,
    media_idx: i32,
    media_source_url: String,
) -> Result<(), String> {
    let mut cmd = Command::new("yt-dlp");
    cmd.arg(&media_source_url)
        .arg("-j")
        .arg("--extractor-args")
        .arg("generic:impersonate")
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    let (output, errors) = run_yt_dlp(&mut cmd).await.map_err(|e| e.to_string())?;

    if !errors.is_empty() {
        println!("Errors: {errors}");
    }

    // yt-dlp outputs one JSON object per line for playlists, or a single object for a single video
    let mut found_any = false;
    for line in output.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }

        // Parse generically to be tolerant of null / missing fields.
        match serde_json::from_str::<Value>(trimmed) {
            Ok(v) => {
                let title = v
                    .get("title")
                    .and_then(|t| t.as_str())
                    .filter(|s| !s.is_empty())
                    .unwrap_or(media_source_url.as_str())
                    .to_string();
                // Enhanced thumbnail extraction strategy per spec
                let thumbnail = v
                    .get("thumbnail")
                    .and_then(|t| t.as_str())
                    .filter(|s| !s.is_empty())
                    .or_else(|| {
                        // Try thumbnails array - pick highest resolution or last element
                        v.get("thumbnails").and_then(|thumbnails| {
                            thumbnails.as_array().and_then(|arr| {
                                arr.last().and_then(|thumb| thumb.get("url")).and_then(|url| url.as_str())
                            })
                        })
                    })
                    .or_else(|| {
                        // Try thumbnail_url field
                        v.get("thumbnail_url").and_then(|t| t.as_str())
                    })
                    .unwrap_or_default()
                    .to_string();

                found_any = true;
                window
                    .emit("update-media-info", (media_idx, media_source_url.clone(), title, thumbnail))
                    .map_err(|e| e.to_string())?;
            }
            Err(e) => {
                println!("Failed to parse yt-dlp output line as generic JSON: {e}\nLine: {trimmed}");
            }
        }
    }
    if !found_any {
        return Err("No valid media info found in yt-dlp output.".to_string());
    }

    Ok(())
}

// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
pub fn download_media(
    _app: AppHandle,
    window: Window,
    media_idx: i32,
    media_source_url: String,
    output_location: String,
) {
    let window = window.clone();

    spawn(async move {
        let output_format = format!("{}{}{}", output_location, path::MAIN_SEPARATOR, "%(title)s [%(id)s].%(ext)s");

        // Build the yt-dlp command
        let mut cmd = Command::new("yt-dlp");
        cmd.arg(media_source_url)
            .arg("--progress-template")
            .arg("download:remedia-%(progress._percent_stripped)s-%(progress.eta)s-%(info.id)s")
            .arg("--newline")
            .arg("--continue")
            .arg("--no-overwrites")
            .arg("--output")
            .arg(output_format)
            .arg("--embed-thumbnail")
            .arg("--embed-subs")
            .arg("--embed-metadata")
            .arg("--embed-chapters")
            .arg("--windows-filenames")
            // .arg("--sponsorblock-remove")
            // .arg("default")
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());

        let mut child = cmd.spawn().expect("Failed to spawn yt-dlp");

        let stdout = child.stdout.take().expect("Failed to open stdout");
        let stderr = child.stderr.take().expect("Failed to open stderr");

        let out_reader = BufReader::new(stdout);
        let err_reader = BufReader::new(stderr);

        out_reader.lines().for_each(|line| {
            if let Ok(line) = line {
                println!("{line}");

                // Check if the line starts with 'remedia-'
                if line.starts_with("remedia-") {
                    // Output format: remedia-75.3-00:12-abc123
                    let ln_status: Vec<&str> = line.split('-').collect();

                    // Check we have at least 3 segments before proceeding
                    if ln_status.len() >= 3 {
                        // Parse percent directly from the first segment
                        let percent = ln_status.get(1).and_then(|s| s.parse::<f64>().ok());

                        // Only proceed if percent was successfully parsed
                        if let Some(percent_value) = percent {
                            // Emit event to frontend
                            if let Err(e) = window.emit("download-progress", (media_idx, percent_value)) {
                                eprintln!("Failed to emit download progress: {}", e);
                            }
                        } else {
                            eprintln!("Failed to parse percent from line: {}", line);
                        }
                    } else {
                        eprintln!("Invalid progress line format - expected at least 3 segments: {}", line);
                    }
                }
            }
        });

        // Handle child process errors
        err_reader.lines().for_each(|line| {
            if let Ok(line) = line {
                // Emit stderr as event to frontend
                if let Err(e) = window.emit("yt-dlp-stderr", (media_idx, line.clone())) {
                    eprintln!("Failed to emit yt-dlp stderr: {}", e);
                }
            }
        });

        // Wait for the child process to exit
        let status = child.wait().expect("Failed to wait on yt-dlp");
        if status.success() {
            window.emit("download-complete", media_idx).unwrap();
        } else {
            window.emit("download-error", media_idx).unwrap();
        }
    });
}
