//! Event emission helpers for the download system.
//!
//! Provides generic helpers for emitting download-related events to both
//! the Tauri frontend and remote control connections.

use serde_json::json;
use tauri::{Emitter, Manager};

use crate::events::*;
use crate::logging::{log_error_simple, ErrorCategory};
use crate::remote_control::broadcast_remote_event;

/// Generic helper to emit download errors for any window type that implements Emitter + Manager.
/// This eliminates duplication between Window and WebviewWindow error handlers.
pub fn emit_download_error<W>(window: &W, media_idx: i32, reason: &str)
where
    W: Emitter<tauri::Wry> + Manager<tauri::Wry>,
{
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
    broadcast_remote_event(EVT_DOWNLOAD_ERROR, json!(media_idx));
    broadcast_remote_event(EVT_DOWNLOAD_ERROR_DETAIL, json!([media_idx, reason]));
}
