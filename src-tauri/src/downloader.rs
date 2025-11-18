use std::io::BufRead;
use std::io::BufReader;
use std::io::Read;
use std::path;
use std::process::Command;
use std::process::Stdio;

use serde::Deserialize;
use serde_json::Value;
use tauri::async_runtime::spawn;
use tauri::AppHandle;
use tauri::Emitter;
use tauri::Window;

// Download settings from frontend (Phase 3.3)
#[derive(Debug, Deserialize)]
pub struct DownloadSettings {
    download_mode: String,    // "video" | "audio"
    video_quality: String,    // "best" | "high" | "medium" | "low"
    max_resolution: String,   // "2160p" | "1440p" | "1080p" | "720p" | "480p" | "no-limit"
    video_format: String,     // "mp4" | "mkv" | "webm" | "best"
    audio_format: String,     // "mp3" | "m4a" | "opus" | "best"
    audio_quality: String,    // "0" | "2" | "5" | "9"
}

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
                // Robust thumbnail extraction: try multiple fields
                let thumbnail = v
                    .get("thumbnail")
                    .and_then(|t| t.as_str())
                    .filter(|s| !s.is_empty())
                    .or_else(|| {
                        // Try thumbnails array - pick the last (usually highest resolution)
                        v.get("thumbnails")
                            .and_then(|arr| arr.as_array())
                            .and_then(|thumbnails| thumbnails.last())
                            .and_then(|thumb| thumb.get("url"))
                            .and_then(|url| url.as_str())
                            .filter(|s| !s.is_empty())
                    })
                    .or_else(|| {
                        // Try thumbnail_url as fallback
                        v.get("thumbnail_url")
                            .and_then(|t| t.as_str())
                            .filter(|s| !s.is_empty())
                    })
                    .unwrap_or_default()
                    .to_string();

                found_any = true;
                window
                    .emit(
                        "update-media-info",
                        (media_idx, media_source_url.clone(), title, thumbnail),
                    )
                    .map_err(|e| e.to_string())?;
            }
            Err(e) => {
                println!(
                    "Failed to parse yt-dlp output line as generic JSON: {e}\nLine: {trimmed}"
                );
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
    settings: DownloadSettings,
) {
    let window = window.clone();

    spawn(async move {
        // Robust output template: include ID for uniqueness, handle playlists
        let output_format = format!(
            "{}{}{}",
            output_location,
            path::MAIN_SEPARATOR,
            "%(title)s [%(id)s].%(ext)s"
        );

        // Build the yt-dlp command
        let mut cmd = Command::new("yt-dlp");
        cmd.arg(media_source_url)
                .arg("--progress-template")
                .arg("download:remedia-%(progress._percent_str)s-%(progress.eta)s")
                .arg("--newline")
                .arg("--continue")
                .arg("--no-overwrites")  // Prevent silent overwrites
                .arg("--output")
                .arg(output_format)
                .arg("--embed-thumbnail")
                .arg("--embed-subs")
                .arg("--embed-metadata")
                .arg("--embed-chapters")
                .arg("--windows-filenames");  // Safe filenames for Windows

        // Phase 3.3: Apply settings-based format selection
        if settings.download_mode == "audio" {
            // Audio-only mode
            cmd.arg("-f").arg("bestaudio")
                .arg("--extract-audio");

            if settings.audio_format != "best" {
                cmd.arg("--audio-format").arg(&settings.audio_format);
            }

            cmd.arg("--audio-quality").arg(&settings.audio_quality);
        } else {
            // Video mode
            let format_str = if settings.max_resolution != "no-limit" {
                // Extract resolution height (e.g., "1080" from "1080p")
                let height = settings.max_resolution.trim_end_matches('p');
                format!("bestvideo[height<={}]+bestaudio/best[height<={}]", height, height)
            } else {
                String::from("bestvideo+bestaudio/best")
            };

            cmd.arg("-f").arg(&format_str);

            // Apply video format remuxing if needed
            if settings.video_format != "best" {
                cmd.arg("--remux-video").arg(&settings.video_format);
            }
        }

        cmd.stdout(Stdio::piped())
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
                    // New format: remedia-<percent>-<eta>
                    // Example: remedia-45.2%-2:30
                    let parts: Vec<&str> = line.split('-').collect();

                    // We expect at least 2 segments: ["remedia", "<percent>", ...]
                    if parts.len() >= 2 {
                        // Get the percent string (e.g., "45.2%" or "100%" or "N/A")
                        if let Some(percent_str) = parts.get(1) {
                            // Remove the '%' sign if present and parse as f64
                            let percent_clean = percent_str.trim_end_matches('%');

                            if let Ok(percent) = percent_clean.parse::<f64>() {
                                // Emit event to frontend with clamped percent value
                                let clamped_percent = percent.max(0.0).min(100.0);
                                if let Err(e) = window.emit("download-progress", (media_idx, clamped_percent)) {
                                    eprintln!("Failed to emit download progress: {}", e);
                                }
                            } else if percent_clean != "N/A" {
                                // Only log if it's not the expected "N/A" value
                                eprintln!("Failed to parse percent value: {}", percent_clean);
                            }
                        }
                    } else {
                        eprintln!("Invalid progress line format - expected at least 2 segments: {}", line);
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
