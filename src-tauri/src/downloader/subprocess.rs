//! Download subprocess management.
//!
//! Handles spawning yt-dlp processes, monitoring their output, and managing
//! cancellation via atomic flags.

use std::collections::HashMap;
use std::path;
use std::process::Stdio;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, LazyLock, Mutex};

use serde_json::json;
use tauri::{Emitter, Manager, WebviewWindow};
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::Command;

use crate::download_queue::with_queue;
use crate::events::*;
use crate::logging::append_yt_dlp_log;
use crate::remote_control::{broadcast_if_active, broadcast_remote_event};

use super::events::emit_download_error;
use super::progress::parse_progress_percent;
use super::settings::{build_format_args, build_rate_and_size_args, generate_unique_id, DownloadSettings};
use super::{notify_queue, progress::should_emit_stderr};

/// Interval in milliseconds to check for cancellation requests
const CANCELLATION_POLL_INTERVAL_MS: u64 = 100;

/// Debounce interval for progress updates
const PROGRESS_DEBOUNCE_MS: u128 = 100;

// Track cancellation flags for active downloads
static DOWNLOAD_CANCEL_FLAGS: LazyLock<Mutex<HashMap<i32, Arc<AtomicBool>>>> =
    LazyLock::new(|| Mutex::new(HashMap::new()));

/// Request cancellation for a specific download.
pub fn request_cancel(media_idx: i32) -> bool {
    let flags = DOWNLOAD_CANCEL_FLAGS.lock().unwrap();
    if let Some(flag) = flags.get(&media_idx) {
        flag.store(true, Ordering::Relaxed);
        eprintln!("Cancellation requested for media_idx {}", media_idx);
        true
    } else {
        eprintln!("No active download found for media_idx {}", media_idx);
        false
    }
}

/// Request cancellation for all active downloads.
/// Returns the indices of downloads that were flagged.
pub fn request_cancel_all() -> Vec<i32> {
    let flags = DOWNLOAD_CANCEL_FLAGS.lock().unwrap();
    for (_idx, flag) in flags.iter() {
        flag.store(true, Ordering::Relaxed);
    }
    flags.keys().copied().collect()
}

/// Execute a download (called by queue processor).
///
/// Spawns yt-dlp as a subprocess, monitors its output for progress,
/// and handles cancellation requests.
pub fn execute_download(
    window: WebviewWindow,
    media_idx: i32,
    media_source_url: String,
    output_location: String,
    subfolder: Option<String>,
    settings: DownloadSettings,
) {
    let window_clone = window.clone();

    tauri::async_runtime::spawn(async move {
        let window = window_clone;
        // Register cancellation flag for this download
        let cancel_flag = Arc::new(AtomicBool::new(false));
        {
            let mut flags = DOWNLOAD_CANCEL_FLAGS.lock().unwrap();
            flags.insert(media_idx, cancel_flag.clone());
        }

        let mark_queue_fail = |_context: &str| with_queue(|queue| queue.fail(media_idx));

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
                format!(
                    "{}{}%(title)s [{}].%(ext)s",
                    output_dir,
                    path::MAIN_SEPARATOR,
                    unique_id
                )
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
                emit_download_error(&window, media_idx, &format!("spawn yt-dlp failed: {e}"));
                notify_queue();
                return;
            }
        };

        let stdout = match child.stdout.take() {
            Some(stdout) => stdout,
            None => {
                mark_queue_fail("while handling missing stdout");
                emit_download_error(&window, media_idx, "yt-dlp stdout unavailable");
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
                emit_download_error(&window, media_idx, "yt-dlp stderr unavailable");
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

        // Immediately emit 0% so UI shows activity even before yt-dlp prints progress
        if let Err(e) = window.emit(EVT_DOWNLOAD_PROGRESS, (media_idx, 0.0)) {
            eprintln!("Failed to emit initial download progress: {}", e);
        }
        broadcast_if_active(EVT_DOWNLOAD_PROGRESS, json!([media_idx, 0.0]));

        let mut cancelled = false;
        let mut stdout_done = false;
        let mut stderr_done = false;
        let mut process_exited = false;
        let mut status: Option<std::process::ExitStatus> = None;

        loop {
            if process_exited && stdout_done && stderr_done {
                break;
            }

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
                                    broadcast_if_active(EVT_DOWNLOAD_PROGRESS, json!([media_idx, percent]));
                                    last_progress_emit = std::time::Instant::now();
                                }
                            }
                            broadcast_if_active(EVT_DOWNLOAD_RAW, json!([media_idx, "stdout", line]));
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
                                    json!([media_idx, percent]),
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
                                broadcast_if_active(EVT_YTDLP_STDERR, json!([media_idx, line]));
                            }
                            broadcast_if_active(EVT_DOWNLOAD_RAW, json!([media_idx, "stderr", line]));
                        }
                        Ok(None) => stderr_done = true,
                        Err(e) => {
                            eprintln!("Error reading stderr: {}", e);
                            stderr_done = true;
                        }
                    }
                }

                // Wait for process exit
                res = child.wait(), if !process_exited => {
                    match res {
                        Ok(s) => status = Some(s),
                        Err(e) => {
                            eprintln!("Error waiting for child process: {}", e);
                            status = None;
                        }
                    }
                    process_exited = true;
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
            broadcast_remote_event(EVT_DOWNLOAD_CANCELLED, json!(media_idx));
            // Mark as cancelled in queue
            with_queue(|queue| queue.cancel(media_idx));
        } else if let Some(status) = status {
            if status.success() {
                if let Err(e) = window.emit(EVT_DOWNLOAD_COMPLETE, media_idx) {
                    eprintln!("Failed to emit download-complete: {}", e);
                }
                broadcast_remote_event(EVT_DOWNLOAD_COMPLETE, json!(media_idx));
                // Mark as completed in queue
                with_queue(|queue| queue.complete(media_idx));
            } else {
                emit_download_error(&window, media_idx, "yt-dlp exited with error status");
                // Mark as failed in queue
                mark_queue_fail("after non-success status");
            }
        } else {
            // Status is None (wait error)
            emit_download_error(&window, media_idx, "yt-dlp wait failed");
            mark_queue_fail("after wait error");
        }

        // Try to start next download from queue
        notify_queue();
    });
}
