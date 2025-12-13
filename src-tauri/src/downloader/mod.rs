//! Download orchestration and Tauri command handlers.
//!
//! This module coordinates downloads, manages the queue pump, and exposes
//! Tauri commands for the frontend.
//!
//! ## Module Structure
//! - `commands` - Tauri command handlers
//! - `events` - Event emission helpers
//! - `media_info` - Media metadata extraction
//! - `playlist` - Playlist/channel URL expansion
//! - `progress` - Progress message parsing
//! - `settings` - Download settings validation
//! - `subprocess` - yt-dlp process management
//! - `ytdlp` - Low-level yt-dlp execution

// Public modules for Tauri command re-exports (macros generate __cmd__ functions)
pub mod commands;

mod events;
mod media_info;
mod playlist;
mod progress;
mod settings;
mod subprocess;
mod ytdlp;

// Re-exports for external consumers
pub use playlist::{PlaylistExpansion, PlaylistItem};
pub use settings::DownloadSettings;

use std::sync::OnceLock;

use serde_json::json;
use tauri::async_runtime::spawn;
use tauri::{AppHandle, Emitter, Manager};

use crate::download_queue::with_queue;
use crate::events::*;
use crate::logging::{ErrorCategory, log_error_simple, log_error_with_context, log_info_simple};
use crate::remote_control::broadcast_remote_event;

use subprocess::execute_download;

// Queue pump infrastructure
static QUEUE_NOTIFY: std::sync::LazyLock<tokio::sync::Notify> = std::sync::LazyLock::new(tokio::sync::Notify::new);
static QUEUE_APP_HANDLE: OnceLock<AppHandle> = OnceLock::new();

/// Signal the queue pump to check for available work.
/// Call this after enqueue, capacity change, or download completion.
pub fn notify_queue() {
    QUEUE_NOTIFY.notify_one();
}

/// Start the queue pump (called once at app startup from lib.rs).
/// The pump waits on QUEUE_NOTIFY and processes downloads until capacity is exhausted.
pub fn start_queue_pump(app: AppHandle) -> Result<(), String> {
    // Ensure we only initialize once
    if let Err(_already_set) = QUEUE_APP_HANDLE.set(app.clone()) {
        // This should be rare (multiple calls to start). Treat as critical.
        log_error_simple(&app, ErrorCategory::System, "Queue pump initialization attempted more than once", None);
        return Err("Queue pump already initialized".into());
    }

    // Supervisor task: spawn worker, watch for unexpected termination and attempt restarts
    // Clone `app` for the spawned supervisor so we don't move the original `app`.
    let supervisor_app = app.clone();
    spawn(async move {
        const MAX_RESTARTS: u32 = 5;
        const BASE_BACKOFF_MS: u64 = 1000;

        let mut restarts = 0u32;

        loop {
            // Worker task runs the actual pump loop
            let app_clone = supervisor_app.clone();
            let worker = spawn(async move {
                log_info_simple(&app_clone, ErrorCategory::Unknown, "Download queue pump running");
                loop {
                    QUEUE_NOTIFY.notified().await;
                    pump_queue_once(&app_clone).await;
                }
            });

            // Await worker termination
            match worker.await {
                Ok(()) => {
                    // Worker returned normally (unexpected)
                    log_error_with_context(
                        &supervisor_app,
                        ErrorCategory::System,
                        "Queue pump task exited unexpectedly (normal return)",
                        json!({ "restarts": restarts }),
                        None,
                    );
                }
                Err(e) => {
                    log_error_with_context(
                        &supervisor_app,
                        ErrorCategory::System,
                        "Queue pump task terminated unexpectedly (panic/join error)",
                        json!({ "restarts": restarts }),
                        Some(&format!("{:?}", e)),
                    );
                }
            }

            if restarts >= MAX_RESTARTS {
                log_error_with_context(
                    &supervisor_app,
                    ErrorCategory::System,
                    "Queue pump exceeded maximum restart attempts and will not be restarted",
                    json!({ "restarts": restarts }),
                    None,
                );

                // Notify frontend of critical failure so user knows downloads won't work
                if let Err(e) = supervisor_app.emit(
                    crate::events::EVT_STARTUP_ERROR,
                    "Download queue has stopped working. Please restart the application.",
                ) {
                    eprintln!("Failed to emit queue pump failure event: {}", e);
                }

                break;
            }

            // Exponential backoff before restart
            let backoff = BASE_BACKOFF_MS.saturating_mul(1 << restarts.min(10));
            log_info_simple(
                &supervisor_app,
                ErrorCategory::Unknown,
                &format!("Restarting queue pump in {} ms (attempt {})", backoff, restarts + 1),
            );
            tokio::time::sleep(std::time::Duration::from_millis(backoff)).await;
            restarts += 1;
        }
    });

    log_info_simple(&app, ErrorCategory::Unknown, "Download queue pump initialized successfully");

    Ok(())
}

/// Process queue until no more capacity or items available.
async fn pump_queue_once(app: &AppHandle) {
    let Some(window) = app.get_webview_window("main") else {
        log_error_simple(app, ErrorCategory::System, "Queue pump: main window not found", None);
        return;
    };

    loop {
        // Pull the next download to start, if any capacity available
        let maybe_download = with_queue(|queue| queue.next_to_start());

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
                    json!({
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
                broadcast_remote_event(EVT_DOWNLOAD_ERROR, json!(queued_download.media_idx));
                with_queue(|queue| queue.fail(queued_download.media_idx));
                continue; // Try next item in queue
            }
        };

        // Emit download-started event
        if let Err(e) = window.emit(EVT_DOWNLOAD_STARTED, queued_download.media_idx) {
            log_error_simple(app, ErrorCategory::System, "Failed to emit download-started", Some(&e.to_string()));
        }
        broadcast_remote_event(EVT_DOWNLOAD_STARTED, json!(queued_download.media_idx));
        broadcast_remote_event(
            EVT_DOWNLOAD_EXEC,
            json!([queued_download.media_idx, queued_download.url, queued_download.output_location]),
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

        let (output, errors) = ytdlp::run_yt_dlp(&mut cmd).await.expect("Failed to run yt-dlp");

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

            if let Some(info) = media_info::extract_media_info_from_value(&v, url) {
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

    #[tokio::test]
    #[ignore = "Requires Tauri runtime; run locally"]
    async fn test_start_queue_pump_double_init_returns_err() {
        let app = tauri::Builder::default().build(tauri::generate_context!()).expect("build app");
        let handle = app.handle();

        // First init should succeed
        assert!(start_queue_pump(handle.clone()).is_ok());

        // Second init should return Err because QUEUE_APP_HANDLE is already set
        assert!(start_queue_pump(handle.clone()).is_err());
    }
}
