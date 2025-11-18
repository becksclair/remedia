use std::collections::HashMap;
use std::io::BufRead;
use std::io::BufReader;
use std::io::Read;
use std::path;
use std::process::{Child, Command};
use std::process::Stdio;
use std::sync::Mutex;

use once_cell::sync::Lazy;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::async_runtime::spawn;
use tauri::AppHandle;
use tauri::Emitter;
use tauri::Window;

use crate::download_queue::{get_queue, QueuedDownload, DownloadStatus};

// Download Manager: Track cancellation flags for active downloads
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

// Constants for download management
/// Interval in milliseconds to check for cancellation requests
/// Balance between responsiveness and CPU usage
const CANCELLATION_POLL_INTERVAL_MS: u64 = 100;

/// Maximum URL length to prevent abuse
const MAX_URL_LENGTH: usize = 4096;

/// Maximum output path length (OS limits)
const MAX_OUTPUT_PATH_LENGTH: usize = 1024;

static DOWNLOAD_CANCEL_FLAGS: Lazy<Mutex<HashMap<i32, Arc<AtomicBool>>>> =
    Lazy::new(|| Mutex::new(HashMap::new()));

// Download settings from frontend (Phase 3.3)
#[derive(Debug, Deserialize, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct DownloadSettings {
    download_mode: String,    // "video" | "audio"
    video_quality: String,    // "best" | "high" | "medium" | "low"
    max_resolution: String,   // "2160p" | "1440p" | "1080p" | "720p" | "480p" | "no-limit"
    video_format: String,     // "mp4" | "mkv" | "webm" | "best"
    audio_format: String,     // "mp3" | "m4a" | "opus" | "best"
    audio_quality: String,    // "0" | "2" | "5" | "9"
}

/// Validate download settings fields
fn validate_settings(settings: &DownloadSettings) -> Result<(), String> {
    // Validate download mode
    if !matches!(settings.download_mode.as_str(), "video" | "audio") {
        return Err(format!("Invalid download_mode: {}", settings.download_mode));
    }

    // Validate video quality
    if !matches!(settings.video_quality.as_str(), "best" | "high" | "medium" | "low") {
        return Err(format!("Invalid video_quality: {}", settings.video_quality));
    }

    // Validate max resolution
    if !matches!(settings.max_resolution.as_str(), "2160p" | "1440p" | "1080p" | "720p" | "480p" | "no-limit") {
        return Err(format!("Invalid max_resolution: {}", settings.max_resolution));
    }

    // Validate video format
    if !matches!(settings.video_format.as_str(), "mp4" | "mkv" | "webm" | "best") {
        return Err(format!("Invalid video_format: {}", settings.video_format));
    }

    // Validate audio format
    if !matches!(settings.audio_format.as_str(), "mp3" | "m4a" | "opus" | "best") {
        return Err(format!("Invalid audio_format: {}", settings.audio_format));
    }

    // Validate audio quality
    if !matches!(settings.audio_quality.as_str(), "0" | "2" | "5" | "9") {
        return Err(format!("Invalid audio_quality: {}", settings.audio_quality));
    }

    Ok(())
}

/// Validate URL input
fn validate_url(url: &str) -> Result<(), String> {
    if url.trim().is_empty() {
        return Err("URL cannot be empty".to_string());
    }

    // Basic URL format validation
    if !url.starts_with("http://") && !url.starts_with("https://") {
        return Err("URL must start with http:// or https://".to_string());
    }

    // Length check to prevent abuse
    if url.len() > MAX_URL_LENGTH {
        return Err(format!("URL is too long (max {} characters)", MAX_URL_LENGTH));
    }

    Ok(())
}

/// Validate output location
fn validate_output_location(location: &str) -> Result<(), String> {
    if location.trim().is_empty() {
        return Err("Output location cannot be empty".to_string());
    }

    // Length check
    if location.len() > MAX_OUTPUT_PATH_LENGTH {
        return Err(format!("Output location path is too long (max {} characters)", MAX_OUTPUT_PATH_LENGTH));
    }

    Ok(())
}

/// Parse progress percentage from yt-dlp progress line
/// Returns None if line doesn't contain valid progress
fn parse_progress_percent(line: &str) -> Option<f64> {
    if !line.starts_with("remedia-") {
        return None;
    }

    let parts: Vec<&str> = line.split('-').collect();
    if parts.len() < 2 {
        return None;
    }

    let percent_str = parts.get(1)?;
    let percent_clean = percent_str.trim_end_matches('%');

    if percent_clean == "N/A" {
        return None;
    }

    percent_clean.parse::<f64>().ok()
        .map(|p| p.max(0.0).min(100.0))
}

/// Build format selection arguments for yt-dlp based on settings
fn build_format_args(settings: &DownloadSettings) -> Vec<String> {
    let mut args = Vec::new();

    if settings.download_mode == "audio" {
        // Audio-only mode
        args.push("-f".to_string());
        args.push("bestaudio".to_string());
        args.push("--extract-audio".to_string());

        if settings.audio_format != "best" {
            args.push("--audio-format".to_string());
            args.push(settings.audio_format.clone());
        }

        args.push("--audio-quality".to_string());
        args.push(settings.audio_quality.clone());
    } else {
        // Video mode
        let format_str = if settings.max_resolution != "no-limit" {
            let height = settings.max_resolution.trim_end_matches('p');
            format!("bestvideo[height<={}]+bestaudio/best[height<={}]", height, height)
        } else {
            String::from("bestvideo+bestaudio/best")
        };

        args.push("-f".to_string());
        args.push(format_str);

        if settings.video_format != "best" {
            args.push("--remux-video".to_string());
            args.push(settings.video_format.clone());
        }
    }

    args
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
    // Validate inputs at boundary
    validate_url(&media_source_url)?;

    if media_idx < 0 {
        return Err("Media index must be non-negative".to_string());
    }

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

/// Process the queue and start next available download
fn process_queue(window: Window) {
    let mut queue = get_queue().lock().unwrap();

    // Try to start next download if slots available
    if let Some(queued_download) = queue.next_to_start() {
        // Deserialize settings from JSON
        let settings: DownloadSettings = match serde_json::from_str(&queued_download.settings) {
            Ok(s) => s,
            Err(e) => {
                eprintln!("Failed to deserialize settings for media {}: {}", queued_download.media_idx, e);
                if let Err(emit_err) = window.emit("download-error", queued_download.media_idx) {
                    eprintln!("Failed to emit download error: {}", emit_err);
                }
                queue.fail(queued_download.media_idx);
                return;
            }
        };

        // Emit download-started event
        if let Err(e) = window.emit("download-started", queued_download.media_idx) {
            eprintln!("Failed to emit download-started: {}", e);
        }

        // Start the download
        execute_download(
            window,
            queued_download.media_idx,
            queued_download.url,
            queued_download.output_location,
            settings,
        );
    }
}

/// Execute a download (called by queue processor)
fn execute_download(
    window: Window,
    media_idx: i32,
    media_source_url: String,
    output_location: String,
    settings: DownloadSettings,
) {
    let window_clone = window.clone();

    spawn(async move {
        let window = window_clone;
        // Register cancellation flag for this download
        let cancel_flag = Arc::new(AtomicBool::new(false));
        {
            let mut flags = DOWNLOAD_CANCEL_FLAGS.lock().unwrap();
            flags.insert(media_idx, cancel_flag.clone());
        }

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

        // Apply settings-based format selection using extracted function
        for arg in build_format_args(&settings) {
            cmd.arg(arg);
        }

        cmd.stdout(Stdio::piped())
           .stderr(Stdio::piped());

        let mut child = match cmd.spawn() {
            Ok(child) => child,
            Err(e) => {
                eprintln!("Failed to spawn yt-dlp: {}", e);
                if let Err(emit_err) = window.emit("download-error", media_idx) {
                    eprintln!("Failed to emit download error: {}", emit_err);
                }
                return;
            }
        };

        let stdout = match child.stdout.take() {
            Some(stdout) => stdout,
            None => {
                eprintln!("Failed to capture stdout from yt-dlp");
                if let Err(e) = window.emit("download-error", media_idx) {
                    eprintln!("Failed to emit download error: {}", e);
                }
                return;
            }
        };

        let stderr = match child.stderr.take() {
            Some(stderr) => stderr,
            None => {
                eprintln!("Failed to capture stderr from yt-dlp");
                if let Err(e) = window.emit("download-error", media_idx) {
                    eprintln!("Failed to emit download error: {}", e);
                }
                return;
            }
        };

        let out_reader = BufReader::new(stdout);
        let err_reader = BufReader::new(stderr);

        out_reader.lines().for_each(|line| {
            if let Ok(line) = line {
                println!("{line}");

                // Parse progress using extracted function
                if let Some(percent) = parse_progress_percent(&line) {
                    if let Err(e) = window.emit("download-progress", (media_idx, percent)) {
                        eprintln!("Failed to emit download progress: {}", e);
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

        // Wait for the child process to exit, checking for cancellation
        use std::thread;
        use std::time::Duration;

        let mut cancelled = false;
        let status = loop {
            // Check cancellation flag
            if cancel_flag.load(Ordering::Relaxed) {
                eprintln!("Cancelling download for media_idx {}", media_idx);
                cancelled = true;

                // Kill the child process
                if let Err(e) = child.kill() {
                    eprintln!("Failed to kill yt-dlp process: {}", e);
                }

                break None;
            }

            // Check if process has finished
            match child.try_wait() {
                Ok(Some(status)) => break Some(status),
                Ok(None) => {
                    // Still running, sleep briefly before checking again
                    thread::sleep(Duration::from_millis(CANCELLATION_POLL_INTERVAL_MS));
                }
                Err(e) => {
                    eprintln!("Error checking process status: {}", e);
                    if let Err(emit_err) = window.emit("download-error", media_idx) {
                        eprintln!("Failed to emit download error: {}", emit_err);
                    }
                    break None;
                }
            }
        };

        // Clean up cancellation flag
        {
            let mut flags = DOWNLOAD_CANCEL_FLAGS.lock().unwrap();
            flags.remove(&media_idx);
        }

        // Emit appropriate event based on outcome
        if cancelled {
            if let Err(e) = window.emit("download-cancelled", media_idx) {
                eprintln!("Failed to emit download-cancelled: {}", e);
            }
            // Mark as cancelled in queue
            get_queue().lock().unwrap().cancel(media_idx);
        } else if let Some(status) = status {
            if status.success() {
                if let Err(e) = window.emit("download-complete", media_idx) {
                    eprintln!("Failed to emit download-complete: {}", e);
                }
                // Mark as completed in queue
                get_queue().lock().unwrap().complete(media_idx);
            } else {
                if let Err(e) = window.emit("download-error", media_idx) {
                    eprintln!("Failed to emit download-error: {}", e);
                }
                // Mark as failed in queue
                get_queue().lock().unwrap().fail(media_idx);
            }
        }

        // Try to start next download from queue
        process_queue(window);
    });
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
    // Validate inputs at boundary
    if let Err(e) = validate_url(&media_source_url) {
        eprintln!("URL validation failed: {}", e);
        if let Err(emit_err) = window.emit("download-error", media_idx) {
            eprintln!("Failed to emit download error: {}", emit_err);
        }
        return;
    }

    if let Err(e) = validate_output_location(&output_location) {
        eprintln!("Output location validation failed: {}", e);
        if let Err(emit_err) = window.emit("download-error", media_idx) {
            eprintln!("Failed to emit download error: {}", emit_err);
        }
        return;
    }

    if let Err(e) = validate_settings(&settings) {
        eprintln!("Settings validation failed: {}", e);
        if let Err(emit_err) = window.emit("download-error", media_idx) {
            eprintln!("Failed to emit download error: {}", emit_err);
        }
        return;
    }

    if media_idx < 0 {
        eprintln!("Invalid media index: {}", media_idx);
        if let Err(emit_err) = window.emit("download-error", media_idx) {
            eprintln!("Failed to emit download error: {}", emit_err);
        }
        return;
    }

    // Serialize settings to JSON for queue storage
    let settings_json = match serde_json::to_string(&settings) {
        Ok(json) => json,
        Err(e) => {
            eprintln!("Failed to serialize settings: {}", e);
            if let Err(emit_err) = window.emit("download-error", media_idx) {
                eprintln!("Failed to emit download error: {}", emit_err);
            }
            return;
        }
    };

    // Create queued download
    let queued_download = QueuedDownload {
        media_idx,
        url: media_source_url.clone(),
        output_location: output_location.clone(),
        settings: settings_json,
        status: DownloadStatus::Queued,
    };

    // Enqueue the download
    {
        let mut queue = get_queue().lock().unwrap();
        if let Err(e) = queue.enqueue(queued_download) {
            eprintln!("Failed to enqueue download: {}", e);
            if let Err(emit_err) = window.emit("download-error", media_idx) {
                eprintln!("Failed to emit download error: {}", emit_err);
            }
            return;
        }
    }

    // Emit download-queued event
    if let Err(e) = window.emit("download-queued", media_idx) {
        eprintln!("Failed to emit download-queued: {}", e);
    }

    // Try to start next download from queue
    process_queue(window);
}

// Phase 4: Cancellation support
#[tauri::command]
pub fn cancel_download(window: Window, media_idx: i32) {
    let mut flags = DOWNLOAD_CANCEL_FLAGS.lock().unwrap();

    if let Some(flag) = flags.get(&media_idx) {
        flag.store(true, Ordering::Relaxed);
        eprintln!("Cancellation requested for media_idx {}", media_idx);

        // Emit cancelled event immediately
        if let Err(e) = window.emit("download-cancelled", media_idx) {
            eprintln!("Failed to emit download-cancelled: {}", e);
        }
    } else {
        eprintln!("No active download found for media_idx {}", media_idx);
    }
}

#[tauri::command]
pub fn cancel_all_downloads(window: Window) {
    // Cancel all downloads in queue (both queued and active)
    let cancelled_indices = {
        let mut queue = get_queue().lock().unwrap();
        queue.cancel_all()
    };

    // Set cancellation flags for active downloads
    let mut flags = DOWNLOAD_CANCEL_FLAGS.lock().unwrap();

    eprintln!("Cancelling all {} active downloads and {} queued downloads", flags.len(), cancelled_indices.len());

    // Set flags for active downloads
    for (media_idx, flag) in flags.iter() {
        flag.store(true, Ordering::Relaxed);

        // Emit cancelled event for each
        if let Err(e) = window.emit("download-cancelled", *media_idx) {
            eprintln!("Failed to emit download-cancelled for {}: {}", media_idx, e);
        }
    }

    // Emit cancelled events for queued downloads
    for media_idx in cancelled_indices {
        if !flags.contains_key(&media_idx) {
            // Only emit if not already in active (to avoid duplicates)
            if let Err(e) = window.emit("download-cancelled", media_idx) {
                eprintln!("Failed to emit download-cancelled for {}: {}", media_idx, e);
            }
        }
    }

    // Clear all flags
    flags.clear();
}

/// Update the maximum number of concurrent downloads
#[tauri::command]
pub fn set_max_concurrent_downloads(max_concurrent: usize) -> Result<(), String> {
    if max_concurrent == 0 {
        return Err("Max concurrent downloads must be at least 1".to_string());
    }

    let mut queue = get_queue().lock().unwrap();
    queue.set_max_concurrent(max_concurrent);

    eprintln!("Updated max concurrent downloads to {}", max_concurrent);
    Ok(())
}

/// Get current queue status
#[tauri::command]
pub fn get_queue_status() -> (usize, usize, usize) {
    let queue = get_queue().lock().unwrap();
    let status = queue.status();
    (status.queued, status.active, status.max_concurrent)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_progress_percent_valid() {
        assert_eq!(parse_progress_percent("remedia-45.2%-2:30"), Some(45.2));
        assert_eq!(parse_progress_percent("remedia-100%-0:00"), Some(100.0));
        assert_eq!(parse_progress_percent("remedia-0.5%-5:00"), Some(0.5));
    }

    #[test]
    fn test_parse_progress_percent_clamping() {
        // Should clamp to 0-100 range
        assert_eq!(parse_progress_percent("remedia--5%-2:30"), Some(0.0));
        assert_eq!(parse_progress_percent("remedia-150%-0:00"), Some(100.0));
    }

    #[test]
    fn test_parse_progress_percent_na() {
        assert_eq!(parse_progress_percent("remedia-N/A-2:30"), None);
    }

    #[test]
    fn test_parse_progress_percent_invalid() {
        assert_eq!(parse_progress_percent("not-a-progress-line"), None);
        assert_eq!(parse_progress_percent("remedia-"), None);
        assert_eq!(parse_progress_percent("remedia-abc-2:30"), None);
    }

    #[test]
    fn test_build_format_args_audio_mode() {
        let settings = DownloadSettings {
            download_mode: "audio".to_string(),
            video_quality: "best".to_string(),
            max_resolution: "no-limit".to_string(),
            video_format: "best".to_string(),
            audio_format: "mp3".to_string(),
            audio_quality: "0".to_string(),
        };

        let args = build_format_args(&settings);

        assert!(args.contains(&"-f".to_string()));
        assert!(args.contains(&"bestaudio".to_string()));
        assert!(args.contains(&"--extract-audio".to_string()));
        assert!(args.contains(&"--audio-format".to_string()));
        assert!(args.contains(&"mp3".to_string()));
        assert!(args.contains(&"--audio-quality".to_string()));
        assert!(args.contains(&"0".to_string()));
    }

    #[test]
    fn test_build_format_args_audio_best() {
        let settings = DownloadSettings {
            download_mode: "audio".to_string(),
            video_quality: "best".to_string(),
            max_resolution: "no-limit".to_string(),
            video_format: "best".to_string(),
            audio_format: "best".to_string(),
            audio_quality: "0".to_string(),
        };

        let args = build_format_args(&settings);

        // Should not include --audio-format when set to "best"
        assert!(!args.contains(&"--audio-format".to_string()));
    }

    #[test]
    fn test_build_format_args_video_mode_no_limit() {
        let settings = DownloadSettings {
            download_mode: "video".to_string(),
            video_quality: "best".to_string(),
            max_resolution: "no-limit".to_string(),
            video_format: "best".to_string(),
            audio_format: "best".to_string(),
            audio_quality: "0".to_string(),
        };

        let args = build_format_args(&settings);

        assert!(args.contains(&"-f".to_string()));
        let format_idx = args.iter().position(|a| a == "-f").unwrap();
        assert_eq!(args[format_idx + 1], "bestvideo+bestaudio/best");
    }

    #[test]
    fn test_build_format_args_video_mode_1080p() {
        let settings = DownloadSettings {
            download_mode: "video".to_string(),
            video_quality: "best".to_string(),
            max_resolution: "1080p".to_string(),
            video_format: "best".to_string(),
            audio_format: "best".to_string(),
            audio_quality: "0".to_string(),
        };

        let args = build_format_args(&settings);

        let format_idx = args.iter().position(|a| a == "-f").unwrap();
        assert_eq!(args[format_idx + 1], "bestvideo[height<=1080]+bestaudio/best[height<=1080]");
    }

    #[test]
    fn test_build_format_args_video_remux() {
        let settings = DownloadSettings {
            download_mode: "video".to_string(),
            video_quality: "best".to_string(),
            max_resolution: "no-limit".to_string(),
            video_format: "mp4".to_string(),
            audio_format: "best".to_string(),
            audio_quality: "0".to_string(),
        };

        let args = build_format_args(&settings);

        assert!(args.contains(&"--remux-video".to_string()));
        assert!(args.contains(&"mp4".to_string()));
    }
}
