//! Download orchestration and Tauri command handlers.
//!
//! This module coordinates downloads, manages the queue pump, and exposes
//! Tauri commands for the frontend.

mod media_info;
mod playlist;
mod progress;
mod settings;
mod ytdlp;

// Re-exports for external consumers
pub use playlist::{PlaylistExpansion, PlaylistItem};
pub use settings::DownloadSettings;


use std::path;
use std::process::Stdio;
use std::sync::atomic::{AtomicBool, Ordering};
use std::collections::HashMap;
use std::sync::{Arc, Mutex};

use once_cell::sync::Lazy;
use serde_json::Value;
use tauri::async_runtime::spawn;
use tauri::{AppHandle, Emitter, Manager, WebviewWindow, Window};
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::Command;

use crate::download_queue::{DownloadStatus, QueuedDownload, get_queue};
use crate::events::*;
use crate::logging::{append_yt_dlp_log, log_error_simple, log_error_with_context, ErrorCategory};
use crate::remote_control::{broadcast_if_active, broadcast_remote_event};

use media_info::{apply_provider_overrides, extract_media_info_from_value};
use playlist::parse_playlist_expansion;
use progress::{parse_progress_percent, should_emit_stderr};
use settings::{
    build_format_args, build_rate_and_size_args, generate_unique_id, validate_output_location, validate_settings,
    validate_url,
};
use ytdlp::run_yt_dlp;

/// Interval in milliseconds to check for cancellation requests
const CANCELLATION_POLL_INTERVAL_MS: u64 = 100;

// Download Manager: Track cancellation flags for active downloads
static DOWNLOAD_CANCEL_FLAGS: Lazy<Mutex<HashMap<i32, Arc<AtomicBool>>>> = Lazy::new(|| Mutex::new(HashMap::new()));

// Queue pump infrastructure
static QUEUE_NOTIFY: Lazy<tokio::sync::Notify> = Lazy::new(tokio::sync::Notify::new);
static QUEUE_APP_HANDLE: once_cell::sync::OnceCell<AppHandle> = once_cell::sync::OnceCell::new();

/// Signal the queue pump to check for available work.
/// Call this after enqueue, capacity change, or download completion.
pub fn notify_queue() {
    QUEUE_NOTIFY.notify_one();
}

/// Start the queue pump (called once at app startup from lib.rs).
/// The pump waits on QUEUE_NOTIFY and processes downloads until capacity is exhausted.
pub fn start_queue_pump(app: AppHandle) {
    QUEUE_APP_HANDLE.set(app.clone()).ok();

    spawn(async move {
        loop {
            QUEUE_NOTIFY.notified().await;
            pump_queue_once(&app).await;
        }
    });
}

/// Process queue until no more capacity or items available.
async fn pump_queue_once(app: &AppHandle) {
    let Some(window) = app.get_webview_window("main") else {
        log_error_simple(app, ErrorCategory::System, "Queue pump: main window not found", None);
        return;
    };

    loop {
        // Pull the next download to start, if any capacity available
        let maybe_download = {
            let queue = get_queue();
            let mut queue = queue.lock().unwrap();
            queue.next_to_start()
        };

        let Some(queued_download) = maybe_download else {
            break; // No more capacity or no queued items
        };

        // Deserialize settings from JSON
        let settings: DownloadSettings = match serde_json::from_str(&queued_download.settings) {
            Ok(s) => s,
            Err(e) => {
                log_error_with_context(
                    app,
                    ErrorCategory::Validation,
                    "Failed to deserialize download settings",
                    serde_json::json!({
                        "media_idx": queued_download.media_idx,
                        "settings": queued_download.settings
                    }),
                    Some(&e.to_string()),
                );

                if let Err(emit_err) = window.emit(EVT_DOWNLOAD_ERROR, queued_download.media_idx) {
                    log_error_simple(
                        app,
                        ErrorCategory::System,
                        "Failed to emit download error",
                        Some(&emit_err.to_string()),
                    );
                }
                broadcast_remote_event(EVT_DOWNLOAD_ERROR, serde_json::json!(queued_download.media_idx));
                {
                    let queue = get_queue();
                    let mut queue = queue.lock().unwrap();
                    queue.fail(queued_download.media_idx);
                }
                continue; // Try next item in queue
            }
        };

        // Emit download-started event
        if let Err(e) = window.emit(EVT_DOWNLOAD_STARTED, queued_download.media_idx) {
            log_error_simple(app, ErrorCategory::System, "Failed to emit download-started", Some(&e.to_string()));
        }
        broadcast_remote_event(EVT_DOWNLOAD_STARTED, serde_json::json!(queued_download.media_idx));
        broadcast_remote_event(
            EVT_DOWNLOAD_EXEC,
            serde_json::json!([queued_download.media_idx, queued_download.url, queued_download.output_location]),
        );

        // Start the download
        execute_download(
            window.clone(),
            queued_download.media_idx,
            queued_download.url,
            queued_download.output_location,
            queued_download.subfolder,
            settings,
        );
    }
}

fn emit_download_error_window(window: &Window, media_idx: i32, reason: &str) {
    log_error_simple(
        window.app_handle(),
        ErrorCategory::Download,
        &format!("Download error for media_idx {}", media_idx),
        Some(reason),
    );

    if let Err(e) = window.emit(EVT_DOWNLOAD_ERROR, media_idx) {
        log_error_simple(
            window.app_handle(),
            ErrorCategory::System,
            "Failed to emit download error",
            Some(&e.to_string()),
        );
    }
    broadcast_remote_event(EVT_DOWNLOAD_ERROR, serde_json::json!(media_idx));
    broadcast_remote_event(EVT_DOWNLOAD_ERROR_DETAIL, serde_json::json!([media_idx, reason]));
}

fn emit_download_error_webview(window: &WebviewWindow, media_idx: i32, reason: &str) {
    log_error_simple(
        window.app_handle(),
        ErrorCategory::Download,
        &format!("Download error for media_idx {}", media_idx),
        Some(reason),
    );

    if let Err(e) = window.emit(EVT_DOWNLOAD_ERROR, media_idx) {
        log_error_simple(
            window.app_handle(),
            ErrorCategory::System,
            "Failed to emit download error",
            Some(&e.to_string()),
        );
    }
    broadcast_remote_event(EVT_DOWNLOAD_ERROR, serde_json::json!(media_idx));
    broadcast_remote_event(EVT_DOWNLOAD_ERROR_DETAIL, serde_json::json!([media_idx, reason]));
}

#[tauri::command]
pub async fn get_media_info(
    app: AppHandle,
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

    #[cfg(windows)]
    cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW

    let (output, errors) = run_yt_dlp(&mut cmd).await.map_err(|e| e.to_string())?;

    if !errors.is_empty() {
        for line in errors.lines().filter(|l| !l.trim().is_empty()) {
            append_yt_dlp_log(&app, media_idx, line);
        }
    }

    // yt-dlp outputs one JSON object per line for playlists, or a single object for a single video
    let mut found_any = false;
    for line in output.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }

        let v: Value = match serde_json::from_str(trimmed) {
            Ok(v) => v,
            Err(e) => {
                println!("Failed to parse yt-dlp output line as JSON in get_media_info: {}: {}", e, trimmed);
                continue;
            }
        };

        let mut info = match extract_media_info_from_value(&v, &media_source_url) {
            Some(info) => info,
            None => {
                println!("Failed to extract media info from yt-dlp JSON: {trimmed}");
                continue;
            }
        };

        // Apply provider-specific overrides (RedGifs, Twitter/X, etc.)
        apply_provider_overrides(&app, media_idx, &media_source_url, &v, &mut info).await;

        if info.thumbnail.is_empty() {
            println!("Invalid thumbnail URL extracted from: '{}'", trimmed);
        }

        found_any = true;
        window
            .emit(
                EVT_UPDATE_MEDIA_INFO,
                (
                    media_idx,
                    media_source_url.clone(),
                    info.title.clone(),
                    info.thumbnail.clone(),
                    info.preview_url.clone(),
                    info.uploader.clone(),
                    info.collection_id.clone(),
                    info.collection_kind.clone(),
                    info.collection_name.clone(),
                    info.folder_slug.clone(),
                ),
            )
            .map_err(|e| e.to_string())?;
        broadcast_remote_event(
            EVT_UPDATE_MEDIA_INFO,
            serde_json::json!([
                media_idx,
                media_source_url.clone(),
                info.title,
                info.thumbnail,
                info.preview_url,
                info.uploader,
                info.collection_id,
                info.collection_kind,
                info.collection_name,
                info.folder_slug,
            ]),
        );
    }
    if !found_any {
        return Err("No valid media info found in yt-dlp output.".to_string());
    }

    Ok(())
}

#[tauri::command]
pub async fn expand_playlist(app: AppHandle, media_source_url: String) -> Result<PlaylistExpansion, String> {
    validate_url(&media_source_url)?;

    let mut cmd = Command::new("yt-dlp");
    cmd.arg(&media_source_url)
        .arg("--flat-playlist")
        .arg("-J")
        .arg("--extractor-args")
        .arg("generic:impersonate")
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    #[cfg(windows)]
    cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW

    let (output, errors) = run_yt_dlp(&mut cmd).await.map_err(|e| e.to_string())?;

    if !errors.is_empty() {
        log_error_with_context(
            &app,
            ErrorCategory::Download,
            "yt-dlp stderr during playlist expansion",
            serde_json::json!({
                "url": media_source_url,
                "errors": errors
            }),
            None,
        );
    }

    parse_playlist_expansion(&output)
}

/// Execute a download (called by queue processor)
fn execute_download(
    window: WebviewWindow,
    media_idx: i32,
    media_source_url: String,
    output_location: String,
    subfolder: Option<String>,
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

        let mark_queue_fail = |context: &str| match get_queue().lock() {
            Ok(mut queue) => queue.fail(media_idx),
            Err(poisoned) => {
                log_error_with_context(
                    window.app_handle(),
                    ErrorCategory::System,
                    "Download queue lock poisoned",
                    serde_json::json!({
                        "context": context,
                        "media_idx": media_idx
                    }),
                    Some(&poisoned.to_string()),
                );
                poisoned.into_inner().fail(media_idx);
            }
        };

        // Build base output directory (with subfolder if present)
        let output_dir = match &subfolder {
            Some(folder) if !folder.is_empty() => {
                let subfolder_path = format!("{}{}{}", output_location, path::MAIN_SEPARATOR, folder);
                // Create subfolder if it doesn't exist
                if let Err(e) = std::fs::create_dir_all(&subfolder_path) {
                    eprintln!("Warning: Failed to create subfolder {}: {}", subfolder_path, e);
                    // Fall back to base output location
                    output_location.clone()
                } else {
                    subfolder_path
                }
            }
            _ => output_location.clone(),
        };

        // Build output template: optionally include unique ID for avoiding collisions
        let output_format = if settings.append_unique_id {
            if settings.unique_id_type == "hash" {
                // Custom short hash - consistent 8-char format across all platforms
                let unique_id = generate_unique_id(&media_source_url);
                format!("{}{}%(title)s [{}].%(ext)s", output_dir, path::MAIN_SEPARATOR, unique_id)
            } else {
                // Native yt-dlp ID - truly idempotent per video (handles URL variations)
                format!("{}{}%(title)s [%(id)s].%(ext)s", output_dir, path::MAIN_SEPARATOR)
            }
        } else {
            format!("{}{}%(title)s.%(ext)s", output_dir, path::MAIN_SEPARATOR)
        };

        // Build the yt-dlp command
        let mut cmd = Command::new("yt-dlp");
        cmd.arg(&media_source_url)
            .arg("--progress-template")
            .arg("download:remedia-%(progress._percent_str)s-%(progress.eta)s")
            .arg("--newline")
            .arg("--continue")
            .arg("--no-overwrites") // Prevent silent overwrites
            .arg("--output")
            .arg(output_format)
            .arg("--embed-thumbnail")
            .arg("--embed-subs")
            .arg("--embed-metadata")
            .arg("--embed-chapters")
            .arg("--windows-filenames"); // Safe filenames for Windows

        // Apply optional rate and size limits
        for arg in build_rate_and_size_args(&settings) {
            cmd.arg(arg);
        }

        // Apply settings-based format selection using extracted function
        for arg in build_format_args(&settings) {
            cmd.arg(arg);
        }

        cmd.stdout(Stdio::piped()).stderr(Stdio::piped());

        #[cfg(windows)]
        cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW

        let mut child = match cmd.spawn() {
            Ok(child) => child,
            Err(e) => {
                mark_queue_fail("while marking fail after spawn error");
                {
                    let mut flags = DOWNLOAD_CANCEL_FLAGS.lock().unwrap();
                    flags.remove(&media_idx);
                }
                emit_download_error_webview(&window, media_idx, &format!("spawn yt-dlp failed: {e}"));
                notify_queue();
                return;
            }
        };

        let stdout = match child.stdout.take() {
            Some(stdout) => stdout,
            None => {
                mark_queue_fail("while handling missing stdout");
                emit_download_error_webview(&window, media_idx, "yt-dlp stdout unavailable");
                {
                    let mut flags = DOWNLOAD_CANCEL_FLAGS.lock().unwrap();
                    flags.remove(&media_idx);
                }
                notify_queue();
                return;
            }
        };

        let stderr = match child.stderr.take() {
            Some(stderr) => stderr,
            None => {
                mark_queue_fail("while handling missing stderr");
                emit_download_error_webview(&window, media_idx, "yt-dlp stderr unavailable");
                {
                    let mut flags = DOWNLOAD_CANCEL_FLAGS.lock().unwrap();
                    flags.remove(&media_idx);
                }
                notify_queue();
                return;
            }
        };

        let mut out_reader = BufReader::new(stdout).lines();
        let mut err_reader = BufReader::new(stderr).lines();

        // Debounce progress updates
        let mut last_progress_emit = std::time::Instant::now();
        const PROGRESS_DEBOUNCE_MS: u128 = 100;

        // Immediately emit 0% so UI shows activity even before yt-dlp prints progress
        if let Err(e) = window.emit(EVT_DOWNLOAD_PROGRESS, (media_idx, 0.0)) {
            eprintln!("Failed to emit initial download progress: {}", e);
        }
        broadcast_if_active(EVT_DOWNLOAD_PROGRESS, serde_json::json!([media_idx, 0.0]));

        let mut cancelled = false;
        let mut stdout_done = false;
        let mut stderr_done = false;
        let status;

        loop {
            tokio::select! {
                // Check cancellation
                _ = tokio::time::sleep(std::time::Duration::from_millis(CANCELLATION_POLL_INTERVAL_MS)) => {
                    if cancel_flag.load(Ordering::Relaxed) {
                        eprintln!("Cancelling download for media_idx {}", media_idx);
                        cancelled = true;
                        if let Err(e) = child.start_kill() {
                            eprintln!("Failed to kill yt-dlp process: {}", e);
                        }
                    }
                }

                // Read stdout
                res = out_reader.next_line(), if !stdout_done => {
                    match res {
                        Ok(Some(line)) => {
                            // Parse progress using extracted function
                            if let Some(percent) = parse_progress_percent(&line) {
                                // Check debounce (always emit 100% or if enough time passed)
                                if percent >= 100.0 || last_progress_emit.elapsed().as_millis() >= PROGRESS_DEBOUNCE_MS {
                                    if let Err(e) = window.emit(EVT_DOWNLOAD_PROGRESS, (media_idx, percent)) {
                                        eprintln!("Failed to emit download progress: {}", e);
                                    }
                                    broadcast_if_active(EVT_DOWNLOAD_PROGRESS, serde_json::json!([media_idx, percent]));
                                    last_progress_emit = std::time::Instant::now();
                                }
                            }
                            broadcast_if_active(EVT_DOWNLOAD_RAW, serde_json::json!([media_idx, "stdout", line]));
                        }
                        Ok(None) => stdout_done = true,
                        Err(e) => {
                            eprintln!("Error reading stdout: {}", e);
                            stdout_done = true;
                        }
                    }
                }

                // Read stderr
                res = err_reader.next_line(), if !stderr_done => {
                    match res {
                        Ok(Some(line)) => {
                            // Attempt to parse progress from stderr too (yt-dlp often writes progress there)
                            let mut progress_emitted = false;
                            if let Some(percent) = parse_progress_percent(&line)
                                && (percent >= 100.0
                                    || last_progress_emit.elapsed().as_millis() >= PROGRESS_DEBOUNCE_MS)
                            {
                                if let Err(e) =
                                    window.emit(EVT_DOWNLOAD_PROGRESS, (media_idx, percent))
                                {
                                    eprintln!("Failed to emit download progress: {}", e);
                                }
                                last_progress_emit = std::time::Instant::now();
                                broadcast_if_active(
                                    EVT_DOWNLOAD_PROGRESS,
                                    serde_json::json!([media_idx, percent]),
                                );
                                progress_emitted = true;
                            }

                            // Filter stderr events to prevent flooding the frontend
                            if !progress_emitted && should_emit_stderr(&line) {
                                // Persist to rotated log file next to the app config
                                let app = window.app_handle();
                                append_yt_dlp_log(app, media_idx, &line);

                                if let Err(e) = window.emit(EVT_YTDLP_STDERR, (media_idx, &line)) {
                                    eprintln!("Failed to emit yt-dlp stderr: {}", e);
                                }
                                broadcast_if_active(EVT_YTDLP_STDERR, serde_json::json!([media_idx, line]));
                            }
                            broadcast_if_active(EVT_DOWNLOAD_RAW, serde_json::json!([media_idx, "stderr", line]));
                        }
                        Ok(None) => stderr_done = true,
                        Err(e) => {
                            eprintln!("Error reading stderr: {}", e);
                            stderr_done = true;
                        }
                    }
                }

                // Wait for process exit
                res = child.wait() => {
                    match res {
                        Ok(s) => status = Some(s),
                        Err(e) => {
                            eprintln!("Error waiting for child process: {}", e);
                            status = None;
                        }
                    }
                    break;
                }
            }
        }

        // Clean up cancellation flag
        {
            let mut flags = DOWNLOAD_CANCEL_FLAGS.lock().unwrap();
            flags.remove(&media_idx);
        }

        // Emit appropriate event based on outcome
        if cancelled {
            if let Err(e) = window.emit(EVT_DOWNLOAD_CANCELLED, media_idx) {
                eprintln!("Failed to emit download-cancelled: {}", e);
            }
            broadcast_remote_event(EVT_DOWNLOAD_CANCELLED, serde_json::json!(media_idx));
            // Mark as cancelled in queue
            get_queue().lock().unwrap().cancel(media_idx);
        } else if let Some(status) = status {
            if status.success() {
                if let Err(e) = window.emit(EVT_DOWNLOAD_COMPLETE, media_idx) {
                    eprintln!("Failed to emit download-complete: {}", e);
                }
                broadcast_remote_event(EVT_DOWNLOAD_COMPLETE, serde_json::json!(media_idx));
                // Mark as completed in queue
                get_queue().lock().unwrap().complete(media_idx);
            } else {
                emit_download_error_webview(&window, media_idx, "yt-dlp exited with error status");
                // Mark as failed in queue
                mark_queue_fail("after non-success status");
            }
        } else {
            // Status is None (wait error)
            emit_download_error_webview(&window, media_idx, "yt-dlp wait failed");
            mark_queue_fail("after wait error");
        }

        // Try to start next download from queue
        notify_queue();
    });
}

#[tauri::command]
pub fn download_media(
    _app: AppHandle,
    window: Window,
    media_idx: i32,
    media_source_url: String,
    output_location: String,
    subfolder: Option<String>,
    settings: DownloadSettings,
) {
    // Validate inputs at boundary
    if let Err(e) = validate_url(&media_source_url) {
        emit_download_error_window(&window, media_idx, &format!("URL validation failed: {}", e));
        return;
    }

    if let Err(e) = validate_output_location(&output_location) {
        emit_download_error_window(&window, media_idx, &format!("Output location invalid: {}", e));
        return;
    }

    if let Err(e) = validate_settings(&settings) {
        emit_download_error_window(&window, media_idx, &format!("Settings validation failed: {}", e));
        return;
    }

    if media_idx < 0 {
        emit_download_error_window(&window, media_idx, "Invalid media index");
        return;
    }

    broadcast_remote_event(EVT_DOWNLOAD_INVOKE, serde_json::json!([media_idx, media_source_url]));
    broadcast_remote_event(EVT_DOWNLOAD_INVOKE_ACK, serde_json::json!([media_idx, media_source_url]));

    // Serialize settings to JSON for queue storage
    let settings_json = match serde_json::to_string(&settings) {
        Ok(json) => json,
        Err(e) => {
            emit_download_error_window(&window, media_idx, &format!("Serialize settings failed: {}", e));
            return;
        }
    };

    // Create queued download
    let queued_download = QueuedDownload {
        media_idx,
        url: media_source_url.clone(),
        output_location: output_location.clone(),
        settings: settings_json,
        subfolder,
        status: DownloadStatus::Queued,
    };

    // Enqueue the download
    let queue = get_queue();
    {
        let mut queue = queue.lock().unwrap();
        if let Err(e) = queue.enqueue(queued_download) {
            emit_download_error_window(&window, media_idx, &format!("Queue enqueue failed: {}", e));
            return;
        }
    } // release lock before kicking queue processor to avoid deadlock

    // Emit download-queued event
    if let Err(e) = window.emit(EVT_DOWNLOAD_QUEUED, media_idx) {
        eprintln!("Failed to emit download-queued: {}", e);
    }
    broadcast_remote_event(EVT_DOWNLOAD_QUEUED, serde_json::json!(media_idx));

    // Try to start next download from queue
    notify_queue();
}

#[tauri::command]
pub fn cancel_download(media_idx: i32) {
    let flags = DOWNLOAD_CANCEL_FLAGS.lock().unwrap();

    if let Some(flag) = flags.get(&media_idx) {
        flag.store(true, Ordering::Relaxed);
        eprintln!("Cancellation requested for media_idx {}", media_idx);
    } else {
        eprintln!("No active download found for media_idx {}", media_idx);
    }
}

#[tauri::command]
pub fn cancel_all_downloads(window: Window) {
    // Cancel all downloads in queue (both queued and active)
    let cancelled_indices = {
        let queue = get_queue();
        let mut queue = queue.lock().unwrap();
        queue.cancel_all()
    }; // release queue lock before doing any emits

    // Mark all active downloads as cancelled (atomic flags) without emitting yet
    let active_indices: Vec<i32> = {
        let flags = DOWNLOAD_CANCEL_FLAGS.lock().unwrap();
        for (_idx, flag) in flags.iter() {
            flag.store(true, Ordering::Relaxed);
        }
        flags.keys().copied().collect()
    }; // release flags lock before emitting to avoid holding locks during JS IPC

    eprintln!(
        "Cancelling all {} active downloads and {} queued downloads",
        active_indices.len(),
        cancelled_indices.len()
    );

    // Emit cancelled events only for queued items; active ones will emit when their tasks observe the flag
    for media_idx in cancelled_indices {
        if !active_indices.contains(&media_idx) {
            if let Err(e) = window.emit(EVT_DOWNLOAD_CANCELLED, media_idx) {
                eprintln!("Failed to emit download-cancelled for {}: {}", media_idx, e);
            }
            broadcast_remote_event(EVT_DOWNLOAD_CANCELLED, serde_json::json!(media_idx));
        }
    }
}

/// Update the maximum number of concurrent downloads.
/// If capacity increased and there are queued items, immediately starts more downloads.
#[tauri::command]
pub fn set_max_concurrent_downloads(_window: Window, max_concurrent: usize) -> Result<(), String> {
    if max_concurrent == 0 {
        return Err("Max concurrent downloads must be at least 1".to_string());
    }

    {
        let queue = get_queue();
        let mut queue = queue.lock().unwrap();
        queue.set_max_concurrent(max_concurrent);
    }

    eprintln!("Updated max concurrent downloads to {}", max_concurrent);

    // Kick the queue so new capacity is used immediately
    notify_queue();

    Ok(())
}

/// Get current queue status
#[tauri::command]
pub fn get_queue_status() -> (usize, usize, usize) {
    let queue = get_queue();
    let queue = queue.lock().unwrap();
    let status = queue.status();
    (status.queued, status.active, status.max_concurrent)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::process::Stdio;
    use tokio::process::Command;

    #[tokio::test]
    #[ignore = "Requires network access and yt-dlp installed"]
    async fn test_redgifs_integration() {
        let url = "https://www.redgifs.com/watch/unrulygleamingalaskanmalamute";

        let mut cmd = Command::new("yt-dlp");
        cmd.arg(url)
            .arg("-j")
            .arg("--extractor-args")
            .arg("generic:impersonate")
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());

        #[cfg(windows)]
        cmd.creation_flags(0x08000000);

        let (output, errors) = run_yt_dlp(&mut cmd).await.expect("Failed to run yt-dlp");

        if !errors.is_empty() {
            println!("yt-dlp stderr: {}", errors);
        }

        let mut found = false;
        for line in output.lines() {
            let trimmed = line.trim();
            if trimmed.is_empty() {
                continue;
            }

            let v: serde_json::Value = match serde_json::from_str(trimmed) {
                Ok(v) => v,
                Err(e) => {
                    println!(
                        "Failed to parse yt-dlp output line as JSON in test_redgifs_integration: {}: {}",
                        e, trimmed
                    );
                    continue;
                }
            };

            if let Some(info) = extract_media_info_from_value(&v, url) {
                println!(
                    "Found media: Title='{}', Thumbnail='{}', PreviewUrl='{}'",
                    info.title, info.thumbnail, info.preview_url
                );
                if info.thumbnail.is_empty() {
                    println!("Full JSON for debugging: {}", trimmed);
                }
                assert!(!info.title.is_empty(), "Title should not be empty");
                assert!(!info.thumbnail.is_empty(), "Thumbnail should not be empty");
                assert!(info.thumbnail.starts_with("http"), "Thumbnail should be a URL");
                found = true;
            }
        }

        assert!(found, "Should have found at least one media item");
    }
}
