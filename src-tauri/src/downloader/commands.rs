//! Tauri command handlers for the download system.
//!
//! Exposes download-related functionality to the frontend via Tauri commands.

use std::process::Stdio;

use serde_json::{json, Value};
use tauri::{AppHandle, Emitter, Window};
use tokio::process::Command;

use crate::download_queue::{with_queue, DownloadStatus, QueuedDownload, QueueStatus};
use crate::events::*;
use crate::logging::{append_yt_dlp_log, log_error_with_context, ErrorCategory};
use crate::remote_control::broadcast_remote_event;

use super::events::emit_download_error;
use super::media_info::{apply_provider_overrides, extract_media_info_from_value};
use super::notify_queue;
use super::playlist::{parse_playlist_expansion, PlaylistExpansion, MAX_PLAYLIST_ITEMS};
use super::settings::{validate_output_location, validate_settings, validate_url, DownloadSettings};
use super::subprocess::{request_cancel, request_cancel_all};
use super::ytdlp::run_yt_dlp;

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
                println!(
                    "Failed to parse yt-dlp output line as JSON in get_media_info: {}: {}",
                    e, trimmed
                );
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
            json!([
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
    let playlist_window = format!("1-{}", MAX_PLAYLIST_ITEMS);
    cmd.arg(&media_source_url)
        .arg("--playlist-items")
        .arg(&playlist_window)
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
            json!({
                "url": media_source_url,
                "errors": errors
            }),
            None,
        );
    }

    parse_playlist_expansion(&output)
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
        emit_download_error(&window, media_idx, &format!("URL validation failed: {}", e));
        return;
    }

    if let Err(e) = validate_output_location(&output_location) {
        emit_download_error(&window, media_idx, &format!("Output location invalid: {}", e));
        return;
    }

    if let Err(e) = validate_settings(&settings) {
        emit_download_error(&window, media_idx, &format!("Settings validation failed: {}", e));
        return;
    }

    if media_idx < 0 {
        emit_download_error(&window, media_idx, "Invalid media index");
        return;
    }

    broadcast_remote_event(EVT_DOWNLOAD_INVOKE, json!([media_idx, media_source_url]));
    broadcast_remote_event(EVT_DOWNLOAD_INVOKE_ACK, json!([media_idx, media_source_url]));

    // Serialize settings to JSON for queue storage
    let settings_json = match serde_json::to_string(&settings) {
        Ok(json) => json,
        Err(e) => {
            emit_download_error(&window, media_idx, &format!("Serialize settings failed: {}", e));
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
    let enqueue_result = with_queue(|queue| queue.enqueue(queued_download));
    if let Err(e) = enqueue_result {
        emit_download_error(&window, media_idx, &format!("Queue enqueue failed: {}", e));
        return;
    }

    // Emit download-queued event
    if let Err(e) = window.emit(EVT_DOWNLOAD_QUEUED, media_idx) {
        eprintln!("Failed to emit download-queued: {}", e);
    }
    broadcast_remote_event(EVT_DOWNLOAD_QUEUED, json!(media_idx));

    // Try to start next download from queue
    notify_queue();
}

#[tauri::command]
pub fn cancel_download(media_idx: i32) {
    request_cancel(media_idx);
}

#[tauri::command]
pub fn cancel_all_downloads(window: Window) {
    // Cancel all downloads in queue (both queued and active)
    let cancelled_indices = with_queue(|queue| queue.cancel_all());

    // Mark all active downloads as cancelled (atomic flags) without emitting yet
    let active_indices = request_cancel_all();

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
            broadcast_remote_event(EVT_DOWNLOAD_CANCELLED, json!(media_idx));
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

    with_queue(|queue| queue.set_max_concurrent(max_concurrent));

    eprintln!("Updated max concurrent downloads to {}", max_concurrent);

    // Kick the queue so new capacity is used immediately
    notify_queue();

    Ok(())
}

/// Get current queue status
#[tauri::command]
pub fn get_queue_status() -> QueueStatus {
    with_queue(|queue| queue.status())
}
