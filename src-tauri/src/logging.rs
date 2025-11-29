use std::fs::{self, File, OpenOptions};
use std::io::{self, Write};
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use tauri::{AppHandle, Manager, path::BaseDirectory};

/// Maximum size of the log file before rotation (in bytes).
/// This is intentionally small to avoid unbounded growth.
const MAX_LOG_BYTES: u64 = 1_000_000; // ~1 MB

/// Relative path (from the Tauri config directory) to the yt-dlp log file.
/// The final path is resolved via `app.path().resolve(.., BaseDirectory::Config)`.
const YT_DLP_LOG_RELATIVE_PATH: &str = "logs/remedia-yt-dlp.log";

fn resolve_log_path(app: &AppHandle) -> Option<PathBuf> {
    app.path().resolve(YT_DLP_LOG_RELATIVE_PATH, BaseDirectory::Config).ok()
}

fn rotate_if_needed(path: &Path) -> io::Result<()> {
    if let Ok(meta) = fs::metadata(path)
        && meta.len() >= MAX_LOG_BYTES
    {
        // Simple single-file rotation: remedia-yt-dlp.log -> remedia-yt-dlp.log.1
        let file_name = path
            .file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_else(|| "remedia-yt-dlp.log".to_string());

        let rotated_name = format!("{}.1", file_name);
        let rotated_path = path.with_file_name(rotated_name);

        // Best-effort cleanup of any existing rotated file
        let _ = fs::remove_file(&rotated_path);

        fs::rename(path, rotated_path)?;
    }

    Ok(())
}

fn append_line(path: &Path, line: &str) -> io::Result<()> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }

    // Ensure rotation happens before we append
    rotate_if_needed(path)?;

    let mut file = if path.exists() {
        OpenOptions::new().append(true).open(path)?
    } else {
        File::create(path)?
    };

    let timestamp_ms = SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_millis()).unwrap_or(0);

    writeln!(file, "[{}] {}", timestamp_ms, line)?;
    Ok(())
}

/// Append a single yt-dlp stderr line to the rotated log file.
///
/// This is best-effort logging: failures are reported to stderr but do not
/// affect the download flow.
pub fn append_yt_dlp_log(app_handle: &AppHandle, media_idx: i32, line: &str) {
    let Some(path) = resolve_log_path(app_handle) else {
        // If we cannot resolve the path, fall back to stderr only.
        eprintln!("[yt-dlp][media-{}] {}", media_idx, line);
        return;
    };

    let decorated_line = format!("[media-{}] {}", media_idx, line);

    if let Err(e) = append_line(&path, &decorated_line) {
        eprintln!("Failed to write yt-dlp log entry to {}: {}", path.display(), e);
    }
}
