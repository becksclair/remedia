use std::collections::{HashMap, HashSet};
use std::path;
use std::process::Stdio;
use std::sync::Mutex;

use tokio::io::{AsyncBufReadExt, AsyncReadExt, BufReader};
use tokio::process::Command;

use once_cell::sync::Lazy;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::AppHandle;
use tauri::Emitter;
use tauri::Manager;
use tauri::Window;
use tauri::async_runtime::spawn;

use crate::download_queue::{DownloadStatus, QueuedDownload, get_queue};
use crate::events::*;
use crate::logging::append_yt_dlp_log;
use crate::redgifs::fetch_redgifs_thumbnail;
use crate::remote_control::{broadcast_if_active, broadcast_remote_event};
use crate::thumbnail::resolve_thumbnail;

// Download Manager: Track cancellation flags for active downloads
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};

// Constants for download management
/// Interval in milliseconds to check for cancellation requests
/// Balance between responsiveness and CPU usage
const CANCELLATION_POLL_INTERVAL_MS: u64 = 100;

/// Maximum URL length to prevent abuse
const MAX_URL_LENGTH: usize = 4096;

/// Maximum output path length (OS limits)
const MAX_OUTPUT_PATH_LENGTH: usize = 1024;

/// Safety cap for playlist expansion to avoid unbounded queue growth
const MAX_PLAYLIST_ITEMS: usize = 500;

static DOWNLOAD_CANCEL_FLAGS: Lazy<Mutex<HashMap<i32, Arc<AtomicBool>>>> = Lazy::new(|| Mutex::new(HashMap::new()));

// Download settings from frontend (Phase 3.3)
#[derive(Debug, Deserialize, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct DownloadSettings {
    download_mode: String,  // "video" | "audio"
    video_quality: String,  // "best" | "high" | "medium" | "low"
    max_resolution: String, // "2160p" | "1440p" | "1080p" | "720p" | "480p" | "no-limit"
    video_format: String,   // "mp4" | "mkv" | "webm" | "best"
    audio_format: String,   // "mp3" | "m4a" | "opus" | "best"
    audio_quality: String,  // "0" | "2" | "5" | "9"
    #[serde(default = "default_unlimited")]
    download_rate_limit: String, // "50K" | "1M" | ... | "unlimited"
    #[serde(default = "default_unlimited")]
    max_file_size: String, // "50M" | "1G" | ... | "unlimited"
    #[serde(default = "default_true")]
    append_unique_id: bool, // Append unique ID to filenames
    #[serde(default = "default_native")]
    unique_id_type: String, // "native" = yt-dlp's %(id)s, "hash" = FNV-1a hash
}

fn default_native() -> String {
    "native".to_string()
}

fn default_true() -> bool {
    true
}

fn default_unlimited() -> String {
    "unlimited".to_string()
}

impl DownloadSettings {
    pub fn remote_defaults() -> Self {
        Self {
            download_mode: "video".to_string(),
            video_quality: "best".to_string(),
            max_resolution: "no-limit".to_string(),
            video_format: "best".to_string(),
            audio_format: "best".to_string(),
            audio_quality: "0".to_string(),
            download_rate_limit: default_unlimited(),
            max_file_size: default_unlimited(),
            append_unique_id: true,
            unique_id_type: default_native(),
        }
    }
}

/// Generate a short, idempotent unique ID from a URL using FNV-1a hash.
/// Returns an 8-character base36 string (lowercase alphanumeric).
/// This is extremely fast: FNV-1a is a simple multiply-xor loop.
/// 8 chars in base36 = 36^8 = ~2.8 trillion unique values.
fn generate_unique_id(url: &str) -> String {
    // FNV-1a 64-bit hash constants
    const FNV_OFFSET: u64 = 0xcbf29ce484222325;
    const FNV_PRIME: u64 = 0x100000001b3;
    const ID_LENGTH: usize = 8;

    let mut hash = FNV_OFFSET;
    for byte in url.bytes() {
        hash ^= byte as u64;
        hash = hash.wrapping_mul(FNV_PRIME);
    }

    // Encode as base36 (0-9, a-z) for short representation
    let mut result = String::with_capacity(ID_LENGTH);
    let mut value = hash;
    const CHARS: &[u8] = b"0123456789abcdefghijklmnopqrstuvwxyz";

    while value > 0 && result.len() < ID_LENGTH {
        result.push(CHARS[(value % 36) as usize] as char);
        value /= 36;
    }

    // Pad if needed (should rarely happen)
    while result.len() < ID_LENGTH {
        result.push('0');
    }

    result
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

    // Validate download rate limit
    if !validate_size_or_rate(&settings.download_rate_limit) {
        return Err(format!("Invalid download_rate_limit: {}", settings.download_rate_limit));
    }

    // Validate max file size
    if !validate_size_or_rate(&settings.max_file_size) {
        return Err(format!("Invalid max_file_size: {}", settings.max_file_size));
    }

    Ok(())
}

fn validate_size_or_rate(s: &str) -> bool {
    if s == "unlimited" {
        return true;
    }
    if s.is_empty() {
        return false;
    }

    // Find where the number part ends (first char that is not digit or dot)
    let split_idx = s.find(|c: char| !c.is_ascii_digit() && c != '.');

    match split_idx {
        Some(idx) => {
            // We have a suffix or invalid chars
            let (number_part, suffix_part) = s.split_at(idx);

            // Verify number part is a valid float and strictly positive
            match number_part.parse::<f64>() {
                Ok(val) if val > 0.0 => {}
                _ => return false,
            }

            // Verify suffix - only K, M, G are supported based on requirements
            matches!(suffix_part, "K" | "M" | "G" | "k" | "m" | "g")
        }
        None => {
            // purely numeric, must be a valid number and strictly positive
            match s.parse::<f64>() {
                Ok(val) => val > 0.0,
                Err(_) => false,
            }
        }
    }
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
    // Progress template emits strings like:
    // "remedia-12.3%-1:23" or "download:remedia-12.3%-1:23".
    // Find the marker anywhere in the line to be resilient to prefix changes.
    const MARKER: &str = "remedia-";

    let idx = line.find(MARKER)?;
    let after_prefix = &line[idx + MARKER.len()..];
    let percent_end = after_prefix.find('%')?;
    let percent_str = after_prefix[..percent_end].trim();

    if percent_str == "N/A" {
        return None;
    }

    percent_str.parse::<f64>().ok().map(|p| p.clamp(0.0, 100.0))
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

fn build_rate_and_size_args(settings: &DownloadSettings) -> Vec<String> {
    let mut args = Vec::new();

    if settings.download_rate_limit != "unlimited" {
        args.push("--limit-rate".to_string());
        args.push(settings.download_rate_limit.clone());
    }

    if settings.max_file_size != "unlimited" {
        args.push("--max-filesize".to_string());
        args.push(settings.max_file_size.clone());
    }

    args
}

fn emit_download_error(window: &Window, media_idx: i32, reason: &str) {
    eprintln!("Download error for media_idx {}: {}", media_idx, reason);
    if let Err(e) = window.emit(EVT_DOWNLOAD_ERROR, media_idx) {
        eprintln!("Failed to emit download error: {}", e);
    }
    broadcast_remote_event(EVT_DOWNLOAD_ERROR, serde_json::json!(media_idx));
    broadcast_remote_event(EVT_DOWNLOAD_ERROR_DETAIL, serde_json::json!([media_idx, reason]));
}

async fn run_yt_dlp(cmd: &mut Command) -> Result<(String, String), std::io::Error> {
    // Ensure we capture output and close stdin
    cmd.stdin(Stdio::null());
    cmd.stdout(Stdio::piped());
    cmd.stderr(Stdio::piped());

    // On Windows, prevent window creation if possible (though tauri usually handles this)
    #[cfg(windows)]
    cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW

    let mut child = cmd.spawn()?;

    let mut stdout = child.stdout.take().ok_or_else(|| std::io::Error::other("Could not capture stdout"))?;
    let mut stderr = child.stderr.take().ok_or_else(|| std::io::Error::other("Could not capture stderr"))?;

    let mut output = String::new();
    let mut errors = String::new();

    // Read stdout and stderr concurrently
    let (out_res, err_res) = tokio::join!(stdout.read_to_string(&mut output), stderr.read_to_string(&mut errors));

    out_res?;
    err_res?;

    child.wait().await?;

    Ok((output, errors))
}

/// Media info extracted from yt-dlp JSON
struct ExtractedMediaInfo {
    title: String,
    thumbnail: String,
    preview_url: String,
    uploader: Option<String>,
    collection_id: Option<String>,
    collection_kind: Option<String>,
    collection_name: Option<String>,
    folder_slug: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct PlaylistItem {
    url: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    title: Option<String>,
}

/// Result from expanding a playlist URL
#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct PlaylistExpansion {
    /// Playlist title (for folder naming)
    pub playlist_name: Option<String>,
    /// Channel/uploader name (fallback for folder naming)
    pub uploader: Option<String>,
    /// Individual video entries
    pub entries: Vec<PlaylistItem>,
    /// Canonical collection identifier (e.g. "playlist:My Playlist")
    pub collection_id: Option<String>,
    /// Collection kind: "playlist", "channel", or "single"
    pub collection_kind: Option<String>,
    /// Human-readable collection name
    pub collection_name: Option<String>,
    /// Filesystem-friendly folder slug
    pub folder_slug: Option<String>,
}

/// Sanitize a string for use as a folder name (Windows-safe)
fn sanitize_folder_name(name: &str) -> String {
    name.chars()
        .map(|c| match c {
            '/' | '\\' | ':' | '*' | '?' | '"' | '<' | '>' | '|' => '_',
            _ => c,
        })
        .collect::<String>()
        .trim()
        .to_string()
}

/// Normalize a yt-dlp flat-playlist entry into a usable URL + optional title
fn normalize_playlist_entry(entry: &Value) -> Option<PlaylistItem> {
    // Prefer webpage_url as it keeps the watch page (better metadata)
    let mut url =
        entry.get("webpage_url").and_then(|u| u.as_str()).filter(|u| u.starts_with("http")).map(|u| u.to_string());

    // Fallback to direct URL if present
    if url.is_none() {
        url = entry.get("url").and_then(|u| u.as_str()).filter(|u| u.starts_with("http")).map(|u| u.to_string());
    }

    // For YouTube / RedGifs entries, construct watch URL from ID when missing
    if url.is_none() {
        url = entry.get("id").and_then(|v| v.as_str()).and_then(|id| {
            entry.get("extractor").and_then(|e| e.as_str()).and_then(|extractor| match extractor {
                "Youtube" | "YouTube" | "YoutubeTab" | "YoutubeSearchURL" | "YoutubePlaylist" => {
                    Some(format!("https://www.youtube.com/watch?v={id}"))
                }
                "RedGifs" | "RedGifsUser" => Some(format!("https://www.redgifs.com/watch/{id}")),
                _ => None,
            })
        });
    }

    let url = url?;

    let title = entry.get("title").and_then(|t| t.as_str()).filter(|s| !s.is_empty()).map(|s| s.to_string());

    Some(PlaylistItem {
        url,
        title,
    })
}

/// Parse yt-dlp `-J --flat-playlist` JSON into playlist expansion with metadata
fn parse_playlist_expansion(json_str: &str) -> Result<PlaylistExpansion, String> {
    let v: Value = serde_json::from_str(json_str).map_err(|e| format!("Failed to parse yt-dlp JSON: {}", e))?;

    // Extract playlist metadata for folder naming
    let playlist_name = v
        .get("title")
        .or_else(|| v.get("playlist_title"))
        .and_then(|t| t.as_str())
        .filter(|s| !s.is_empty())
        .map(sanitize_folder_name);

    let uploader = v
        .get("uploader")
        .or_else(|| v.get("channel"))
        .or_else(|| v.get("uploader_id"))
        .and_then(|u| u.as_str())
        .filter(|s| !s.is_empty())
        .map(sanitize_folder_name);

    let entries = match v.get("entries").and_then(|e| e.as_array()) {
        Some(e) => e,
        None => {
            // Not a playlist (single video or unsupported format)
            return Ok(PlaylistExpansion {
                playlist_name,
                uploader,
                entries: Vec::new(),
                collection_id: None,
                collection_kind: None,
                collection_name: None,
                folder_slug: None,
            });
        }
    };

    let mut seen = HashSet::new();
    let mut items = Vec::new();

    for entry in entries {
        let Some(item) = normalize_playlist_entry(entry) else {
            continue;
        };

        if !seen.insert(item.url.clone()) {
            continue;
        }

        items.push(item);
        if items.len() >= MAX_PLAYLIST_ITEMS {
            break;
        }
    }

    let (collection_kind, collection_name, folder_slug, collection_id) = if let Some(ref name) = playlist_name {
        let kind = "playlist".to_string();
        let slug = name.clone();
        let id = format!("{}:{}", kind, name);
        (Some(kind), Some(name.clone()), Some(slug), Some(id))
    } else if let Some(ref name) = uploader {
        let kind = "channel".to_string();
        let slug = name.clone();
        let id = format!("{}:{}", kind, name);
        (Some(kind), Some(name.clone()), Some(slug), Some(id))
    } else {
        (None, None, None, None)
    };

    Ok(PlaylistExpansion {
        playlist_name,
        uploader,
        entries: items,
        collection_id,
        collection_kind,
        collection_name,
        folder_slug,
    })
}

/// Extract the best direct URL for preview from formats array
fn extract_preview_url(v: &Value) -> Option<String> {
    // Try top-level url first (some extractors put it here)
    if let Some(url) = v.get("url").and_then(|u| u.as_str()).filter(|s| !s.is_empty()) {
        return Some(url.to_string());
    }

    // Try formats array - prefer highest quality video format
    if let Some(formats) = v.get("formats").and_then(|f| f.as_array()) {
        // Sort by preference: prefer mp4, then by quality/filesize
        let mut best_url: Option<String> = None;
        let mut best_score: i64 = -1;

        for format in formats {
            let url = match format.get("url").and_then(|u| u.as_str()) {
                Some(u) if !u.is_empty() => u,
                _ => continue,
            };

            // Calculate a simple preference score
            let mut score: i64 = 0;

            // Prefer mp4 format
            let ext = format.get("ext").and_then(|e| e.as_str()).unwrap_or("");
            if ext == "mp4" {
                score += 1000;
            }

            // Add quality score if available
            if let Some(height) = format.get("height").and_then(|h| h.as_i64()) {
                score += height;
            }

            // Fallback to filesize as quality indicator
            if let Some(filesize) = format.get("filesize").and_then(|f| f.as_i64()) {
                score += filesize / 1_000_000; // Add MB as score
            }

            if score > best_score {
                best_score = score;
                best_url = Some(url.to_string());
            }
        }

        if best_url.is_some() {
            return best_url;
        }
    }

    None
}

/// Extract title, thumbnail, preview URL, and uploader from an already-parsed yt-dlp JSON value
fn extract_media_info_from_value(v: &Value, media_source_url: &str) -> Option<ExtractedMediaInfo> {
    let title =
        v.get("title").and_then(|t| t.as_str()).filter(|s| !s.is_empty()).unwrap_or(media_source_url).to_string();

    let thumbnail = resolve_thumbnail(v).unwrap_or_default();
    let preview_url = extract_preview_url(v).unwrap_or_default();

    // Extract uploader/channel for folder naming (single videos)
    let uploader = v
        .get("uploader")
        .or_else(|| v.get("channel"))
        .or_else(|| v.get("uploader_id"))
        .and_then(|u| u.as_str())
        .filter(|s| !s.is_empty())
        .map(sanitize_folder_name);

    let (collection_kind, collection_name, folder_slug, collection_id) = if let Some(ref name) = uploader {
        let kind = "channel".to_string();
        let slug = name.clone();
        let id = format!("{}:{}", kind, name);
        (Some(kind), Some(name.clone()), Some(slug), Some(id))
    } else {
        (None, None, None, None)
    };

    Some(ExtractedMediaInfo {
        title,
        thumbnail,
        preview_url,
        uploader,
        collection_id,
        collection_kind,
        collection_name,
        folder_slug,
    })
}

/// Check if a stderr line should be emitted to the frontend
fn should_emit_stderr(line: &str) -> bool {
    let line_lower = line.to_lowercase();
    line_lower.contains("error") || line_lower.contains("warning") || line_lower.contains("failed")
}

/// Apply provider-specific metadata overrides on top of the generic
/// `extract_media_info_from_value` result. This is where we plug in custom
/// behavior for RedGifs, Twitter/X, etc.
async fn apply_provider_overrides(
    app: &AppHandle,
    media_idx: i32,
    media_source_url: &str,
    v: &Value,
    info: &mut ExtractedMediaInfo,
) {
    // RedGifs-specific enhancement: prefer the official API poster thumbnail
    // when available. We still compute a fallback thumbnail via
    // `resolve_thumbnail`, but override it with the API-provided poster URL
    // on success. Log these decisions so they are visible in the debug
    // console.
    if v.get("extractor").and_then(|e| e.as_str()) == Some("RedGifs")
        && let Some(id) = v.get("id").and_then(|i| i.as_str()).or_else(|| v.get("display_id").and_then(|i| i.as_str()))
    {
        match fetch_redgifs_thumbnail(id).await {
            Ok(Some(url)) => {
                append_yt_dlp_log(app, media_idx, &format!("[remedia][redgifs] using API poster thumbnail: {}", url));
                info.thumbnail = url;
            }
            Ok(None) => {
                append_yt_dlp_log(
                    app,
                    media_idx,
                    &format!(
                        "[remedia][redgifs] API did not return thumbnail for id {} (source: {})",
                        id, media_source_url
                    ),
                );
                println!("RedGifs API did not return thumbnail for id {}", id);
            }
            Err(e) => {
                append_yt_dlp_log(
                    app,
                    media_idx,
                    &format!(
                        "[remedia][redgifs] thumbnail fetch failed for id {} (source: {}): {}",
                        id, media_source_url, e
                    ),
                );
                eprintln!("RedGifs thumbnail fetch failed for id {}: {}", id, e);
            }
        }
    }

    // Future provider-specific overrides (Twitter/X, etc.) can be added here.
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

        // Apply provider-specific overrides (RedGifs, Twitter/X, etc.). This keeps
        // `get_media_info` focused on orchestration while helpers handle
        // provider quirks.
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
pub async fn expand_playlist(_app: AppHandle, media_source_url: String) -> Result<PlaylistExpansion, String> {
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
        eprintln!("[expand_playlist] yt-dlp stderr: {}", errors);
    }

    parse_playlist_expansion(&output)
}

/// Process the queue and start downloads until capacity is reached.
/// This loops to fill all available slots, so changing max_concurrent takes effect immediately.
fn process_queue(window: Window) {
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
                eprintln!("Failed to deserialize settings for media {}: {}", queued_download.media_idx, e);
                if let Err(emit_err) = window.emit(EVT_DOWNLOAD_ERROR, queued_download.media_idx) {
                    eprintln!("Failed to emit download error: {}", emit_err);
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
        if let Err(e) = window.emit("download-started", queued_download.media_idx) {
            eprintln!("Failed to emit download-started: {}", e);
        }
        broadcast_remote_event("download-started", serde_json::json!(queued_download.media_idx));
        broadcast_remote_event(
            "download-exec",
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

/// Execute a download (called by queue processor)
fn execute_download(
    window: Window,
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
                eprintln!("Download queue lock poisoned {context} for media_idx {}: {}", media_idx, poisoned);
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
                emit_download_error(&window, media_idx, &format!("spawn yt-dlp failed: {e}"));
                process_queue(window);
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
                process_queue(window.clone());
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
                process_queue(window.clone());
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
                            broadcast_if_active("download-raw", serde_json::json!([media_idx, "stdout", line]));
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

                                if let Err(e) = window.emit("yt-dlp-stderr", (media_idx, line.clone())) {
                                    eprintln!("Failed to emit yt-dlp stderr: {}", e);
                                }
                                broadcast_if_active("yt-dlp-stderr", serde_json::json!([media_idx, line]));
                            }
                            broadcast_if_active("download-raw", serde_json::json!([media_idx, "stderr", line]));
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

    broadcast_remote_event("download-invoke", serde_json::json!([media_idx, media_source_url]));
    broadcast_remote_event(EVT_DOWNLOAD_INVOKE_ACK, serde_json::json!([media_idx, media_source_url]));

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
    let queue = get_queue();
    {
        let mut queue = queue.lock().unwrap();
        if let Err(e) = queue.enqueue(queued_download) {
            emit_download_error(&window, media_idx, &format!("Queue enqueue failed: {}", e));
            return;
        }
    } // release lock before kicking queue processor to avoid deadlock

    // Emit download-queued event
    if let Err(e) = window.emit(EVT_DOWNLOAD_QUEUED, media_idx) {
        eprintln!("Failed to emit download-queued: {}", e);
    }
    broadcast_remote_event(EVT_DOWNLOAD_QUEUED, serde_json::json!(media_idx));

    // Try to start next download from queue
    process_queue(window);
}

// Phase 4: Cancellation support
#[tauri::command]
pub fn cancel_download(media_idx: i32) {
    let flags = DOWNLOAD_CANCEL_FLAGS.lock().unwrap();

    if let Some(flag) = flags.get(&media_idx) {
        flag.store(true, Ordering::Relaxed);
        eprintln!("Cancellation requested for media_idx {}", media_idx);

        // Emit cancelled event immediately
        // Removed to avoid duplicate events (handled by execute_download)
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
pub fn set_max_concurrent_downloads(window: Window, max_concurrent: usize) -> Result<(), String> {
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
    process_queue(window);

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

    /// Create default DownloadSettings for tests - reduces boilerplate
    fn default_settings() -> DownloadSettings {
        DownloadSettings {
            download_mode: "video".to_string(),
            video_quality: "best".to_string(),
            max_resolution: "no-limit".to_string(),
            video_format: "best".to_string(),
            audio_format: "best".to_string(),
            audio_quality: "0".to_string(),
            download_rate_limit: "unlimited".to_string(),
            max_file_size: "unlimited".to_string(),
            append_unique_id: true,
            unique_id_type: "native".to_string(),
        }
    }

    #[test]
    fn test_parse_playlist_expansion_constructs_urls() {
        let json = r#"{
            "_type":"playlist",
            "title":"My Playlist",
            "uploader":"TestChannel",
            "entries":[
                {"id":"abc123","extractor":"Youtube","title":"First"},
                {"id":"unrulygleamingalaskanmalamute","extractor":"RedGifs","title":"Second"}
            ]
        }"#;

        let expansion = parse_playlist_expansion(json).expect("should parse playlist JSON");
        assert_eq!(expansion.playlist_name.as_deref(), Some("My Playlist"));
        assert_eq!(expansion.uploader.as_deref(), Some("TestChannel"));
        assert_eq!(expansion.entries.len(), 2);
        assert_eq!(expansion.entries[0].url, "https://www.youtube.com/watch?v=abc123");
        assert_eq!(expansion.entries[0].title.as_deref(), Some("First"));
        assert_eq!(expansion.entries[1].url, "https://www.redgifs.com/watch/unrulygleamingalaskanmalamute");
        assert_eq!(expansion.entries[1].title.as_deref(), Some("Second"));
    }

    #[test]
    fn test_parse_playlist_expansion_collection_metadata_from_title() {
        let json = r#"{
            "_type":"playlist",
            "title":"My Playlist",
            "uploader":"TestChannel",
            "entries":[
                {"id":"abc123","extractor":"Youtube"}
            ]
        }"#;

        let expansion = parse_playlist_expansion(json).expect("should parse playlist JSON");

        // playlist_name is sanitized title
        assert_eq!(expansion.playlist_name.as_deref(), Some("My Playlist"));
        // collection metadata prefers playlist_name over uploader
        assert_eq!(expansion.collection_kind.as_deref(), Some("playlist"));
        assert_eq!(expansion.collection_name.as_deref(), Some("My Playlist"));
        assert_eq!(expansion.folder_slug.as_deref(), Some("My Playlist"));
        assert_eq!(expansion.collection_id.as_deref(), Some("playlist:My Playlist"));
    }

    #[test]
    fn test_parse_playlist_expansion_collection_metadata_from_uploader_when_no_title() {
        let json = r#"{
            "_type":"playlist",
            "uploader":"TestChannel",
            "entries":[
                {"id":"abc123","extractor":"Youtube"}
            ]
        }"#;

        let expansion = parse_playlist_expansion(json).expect("should parse playlist JSON");

        assert_eq!(expansion.playlist_name, None);
        assert_eq!(expansion.uploader.as_deref(), Some("TestChannel"));
        assert_eq!(expansion.collection_kind.as_deref(), Some("channel"));
        assert_eq!(expansion.collection_name.as_deref(), Some("TestChannel"));
        assert_eq!(expansion.folder_slug.as_deref(), Some("TestChannel"));
        assert_eq!(expansion.collection_id.as_deref(), Some("channel:TestChannel"));
    }

    #[test]
    fn test_parse_playlist_expansion_dedupes_and_limits() {
        let json = r#"{
            "_type":"playlist",
            "entries":[
                {"id":"dup","webpage_url":"https://example.com/video"},
                {"id":"dup","webpage_url":"https://example.com/video"}
            ]
        }"#;

        let expansion = parse_playlist_expansion(json).expect("should parse playlist JSON");
        assert_eq!(expansion.entries.len(), 1);
        assert_eq!(expansion.entries[0].url, "https://example.com/video");
    }

    #[test]
    fn test_parse_playlist_expansion_non_playlist_has_no_collection_metadata() {
        let json = r#"{
            "title":"Single Video",
            "uploader":"UploaderName"
        }"#;

        let expansion = parse_playlist_expansion(json).expect("should parse non-playlist JSON");

        // No entries for non-playlist input
        assert_eq!(expansion.entries.len(), 0);
        // playlist_name and uploader may be populated, but collection metadata should be None
        assert_eq!(expansion.collection_kind, None);
        assert_eq!(expansion.collection_name, None);
        assert_eq!(expansion.folder_slug, None);
        assert_eq!(expansion.collection_id, None);
    }

    #[test]
    fn test_sanitize_folder_name() {
        assert_eq!(sanitize_folder_name("Normal Name"), "Normal Name");
        assert_eq!(sanitize_folder_name("With/Slash"), "With_Slash");
        assert_eq!(sanitize_folder_name("With:Colon"), "With_Colon");
        assert_eq!(sanitize_folder_name("With*Star"), "With_Star");
        assert_eq!(sanitize_folder_name("With?Question"), "With_Question");
        assert_eq!(sanitize_folder_name("Best of 2024 | Top Picks"), "Best of 2024 _ Top Picks");
        assert_eq!(sanitize_folder_name("  Trimmed  "), "Trimmed");
    }

    #[test]
    fn test_parse_progress_percent_valid() {
        assert_eq!(parse_progress_percent("remedia-45.2%-2:30"), Some(45.2));
        assert_eq!(parse_progress_percent("remedia-100%-0:00"), Some(100.0));
        assert_eq!(parse_progress_percent("remedia-0.5%-5:00"), Some(0.5));
        assert_eq!(parse_progress_percent("remedia-  0.5%-5:00"), Some(0.5)); // leading spaces
        assert_eq!(parse_progress_percent("download:remedia-42.0%-0:10"), Some(42.0)); // prefixed marker
    }

    #[test]
    fn test_parse_progress_percent_clamping() {
        // Should clamp to 0-100 range
        assert_eq!(parse_progress_percent("remedia--5%-2:30"), Some(0.0));
        assert_eq!(parse_progress_percent("remedia-150%-0:00"), Some(100.0));
    }

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

        assert!(found, "Should have found at least one media item");
    }

    #[test]
    fn test_redgifs_thumbnail_fallback_from_id() {
        let json = r#"{
            "id":"UnrulyGleamingAlaskanmalamute",
            "extractor":"RedGifs",
            "formats":[{"url":"https://media.redgifs.com/UnrulyGleamingAlaskanmalamute-mobile.mp4"}]
        }"#;

        let v: serde_json::Value = serde_json::from_str(json).expect("valid redgifs json");
        let source_url = "https://www.redgifs.com/watch/unrulygleamingalaskanmalamute";
        let info = extract_media_info_from_value(&v, source_url).expect("should parse redgifs json");

        assert!(!info.thumbnail.is_empty(), "Thumbnail should be constructed");
        assert!(info.thumbnail.contains("UnrulyGleamingAlaskanmalamute"));
        assert!(info.thumbnail.starts_with("https://thumbs"));
        assert!(!info.preview_url.is_empty(), "Preview URL should be extracted");
        assert!(info.preview_url.contains("media.redgifs.com"));
    }

    #[test]
    fn test_extract_media_info_with_uploader_sets_collection_metadata() {
        let json = r#"{
            "title":"Some Video",
            "uploader":"Some Channel"
        }"#;

        let source_url = "https://example.com/watch?v=123";
        let v: serde_json::Value = serde_json::from_str(json).expect("valid media json");
        let info = extract_media_info_from_value(&v, source_url).expect("should parse media json");

        assert_eq!(info.title, "Some Video");
        assert_eq!(info.uploader.as_deref(), Some("Some Channel"));
        assert_eq!(info.collection_kind.as_deref(), Some("channel"));
        assert_eq!(info.collection_name.as_deref(), Some("Some Channel"));
        assert_eq!(info.folder_slug.as_deref(), Some("Some Channel"));
        assert_eq!(info.collection_id.as_deref(), Some("channel:Some Channel"));
    }

    #[test]
    fn test_extract_media_info_without_uploader_has_no_collection_and_uses_fallback_title() {
        let json = r#"{
            "thumbnail":"https://example.com/thumb.jpg"
        }"#;

        let source_url = "https://example.com/video";
        let v: serde_json::Value = serde_json::from_str(json).expect("valid minimal json");
        let info = extract_media_info_from_value(&v, source_url).expect("should parse minimal json");

        // Title should fall back to source URL when missing in JSON
        assert_eq!(info.title, source_url);
        assert!(info.uploader.is_none());
        assert!(info.collection_kind.is_none());
        assert!(info.collection_name.is_none());
        assert!(info.folder_slug.is_none());
        assert!(info.collection_id.is_none());
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
        let mut settings = default_settings();
        settings.download_mode = "audio".to_string();
        settings.audio_format = "mp3".to_string();

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
        let mut settings = default_settings();
        settings.download_mode = "audio".to_string();

        let args = build_format_args(&settings);

        // Should not include --audio-format when set to "best"
        assert!(!args.contains(&"--audio-format".to_string()));
    }

    #[test]
    fn test_build_format_args_video_mode_no_limit() {
        let settings = default_settings();
        let args = build_format_args(&settings);

        assert!(args.contains(&"-f".to_string()));
        let format_idx = args.iter().position(|a| a == "-f").unwrap();
        assert_eq!(args[format_idx + 1], "bestvideo+bestaudio/best");
    }

    #[test]
    fn test_build_format_args_video_mode_1080p() {
        let mut settings = default_settings();
        settings.max_resolution = "1080p".to_string();

        let args = build_format_args(&settings);

        let format_idx = args.iter().position(|a| a == "-f").unwrap();
        assert_eq!(args[format_idx + 1], "bestvideo[height<=1080]+bestaudio/best[height<=1080]");
    }

    #[test]
    fn test_build_format_args_video_remux() {
        let mut settings = default_settings();
        settings.video_format = "mp4".to_string();

        let args = build_format_args(&settings);

        assert!(args.contains(&"--remux-video".to_string()));
        assert!(args.contains(&"mp4".to_string()));
    }

    #[test]
    fn test_validate_settings_rate_limit_and_size() {
        let mut settings = default_settings();

        assert!(validate_settings(&settings).is_ok());

        // Valid cases
        settings.download_rate_limit = "50K".to_string();
        assert!(validate_settings(&settings).is_ok());

        settings.download_rate_limit = "1.5M".to_string();
        assert!(validate_settings(&settings).is_ok());

        settings.download_rate_limit = "1024".to_string();
        assert!(validate_settings(&settings).is_ok());

        // Invalid cases
        settings.download_rate_limit = "50 KB".to_string(); // Space not allowed
        assert!(validate_settings(&settings).is_err());

        settings.download_rate_limit = "abc".to_string(); // Purely alphabetic
        assert!(validate_settings(&settings).is_err());

        settings.download_rate_limit = "KKK50".to_string(); // Malformed
        assert!(validate_settings(&settings).is_err());

        settings.download_rate_limit = "50Kabc".to_string(); // Malformed
        assert!(validate_settings(&settings).is_err());

        settings.download_rate_limit = "50T".to_string(); // Unsupported unit
        assert!(validate_settings(&settings).is_err());

        settings.download_rate_limit = "50X".to_string(); // Unsupported unit
        assert!(validate_settings(&settings).is_err());

        settings.download_rate_limit = "".to_string(); // Empty string
        assert!(validate_settings(&settings).is_err());

        settings.download_rate_limit = "-50".to_string(); // Negative number
        assert!(validate_settings(&settings).is_err());

        settings.download_rate_limit = "0".to_string(); // Zero
        assert!(validate_settings(&settings).is_err());

        settings.download_rate_limit = "0K".to_string(); // Zero with suffix
        assert!(validate_settings(&settings).is_err());

        // Reset for size tests
        settings.download_rate_limit = "unlimited".to_string();

        // Size valid cases
        settings.max_file_size = "50M".to_string();
        assert!(validate_settings(&settings).is_ok());

        settings.max_file_size = "1.5G".to_string();
        assert!(validate_settings(&settings).is_ok());

        settings.max_file_size = "1048576".to_string();
        assert!(validate_settings(&settings).is_ok());

        // Size invalid cases
        settings.max_file_size = "50 M".to_string(); // Space not allowed
        assert!(validate_settings(&settings).is_err());

        settings.max_file_size = "abc".to_string(); // Purely alphabetic
        assert!(validate_settings(&settings).is_err());

        settings.max_file_size = "50T".to_string(); // Unsupported unit
        assert!(validate_settings(&settings).is_err());
    }

    #[test]
    fn test_should_emit_stderr() {
        assert!(should_emit_stderr("ERROR: Something went wrong"));
        assert!(should_emit_stderr("WARNING: Deprecated feature"));
        assert!(should_emit_stderr("Download failed"));
        assert!(!should_emit_stderr("[download] Downloading video 1 of 3"));
        assert!(!should_emit_stderr("[info] Metadata downloaded"));
    }

    #[test]
    fn test_generate_unique_id_deterministic() {
        // Same URL should always produce same ID (idempotent)
        let url = "https://www.youtube.com/watch?v=dQw4w9WgXcQ";
        let id1 = generate_unique_id(url);
        let id2 = generate_unique_id(url);
        assert_eq!(id1, id2);
    }

    #[test]
    fn test_generate_unique_id_different_urls() {
        // Different URLs should produce different IDs
        let id1 = generate_unique_id("https://www.youtube.com/watch?v=abc123");
        let id2 = generate_unique_id("https://www.youtube.com/watch?v=xyz789");
        assert_ne!(id1, id2);
    }

    #[test]
    fn test_generate_unique_id_format() {
        // ID should be exactly 8 characters, all lowercase alphanumeric
        let id = generate_unique_id("https://example.com/video");
        assert_eq!(id.len(), 8);
        assert!(id.chars().all(|c| c.is_ascii_lowercase() || c.is_ascii_digit()));
    }

    #[test]
    fn test_generate_unique_id_empty_url() {
        // Even empty URL should produce valid 8-char ID
        let id = generate_unique_id("");
        assert_eq!(id.len(), 8);
        assert!(id.chars().all(|c| c.is_ascii_lowercase() || c.is_ascii_digit()));
    }

    #[test]
    fn test_generate_unique_id_special_characters() {
        // URLs with special characters should work
        let id = generate_unique_id("https://example.com/video?a=1&b=2#section");
        assert_eq!(id.len(), 8);
        assert!(id.chars().all(|c| c.is_ascii_lowercase() || c.is_ascii_digit()));
    }

    #[test]
    fn test_build_yt_dlp_command_with_rate_limit() {
        let settings = DownloadSettings {
            download_mode: "video".to_string(),
            video_quality: "best".to_string(),
            max_resolution: "1080p".to_string(),
            video_format: "mp4".to_string(),
            audio_format: "mp3".to_string(),
            audio_quality: "0".to_string(),
            download_rate_limit: "50M".to_string(),
            max_file_size: "unlimited".to_string(),
            append_unique_id: false,
            unique_id_type: "native".to_string(),
        };

        let args = build_rate_and_size_args(&settings);

        // Should include rate limit arg
        assert!(args.iter().any(|arg| arg == "--limit-rate"));
        let rate_limit_idx = args.iter().position(|arg| arg == "--limit-rate").unwrap();
        assert_eq!(args[rate_limit_idx + 1], "50M");

        // Should not include max filesize when unlimited
        assert!(!args.iter().any(|arg| arg == "--max-filesize"));
    }

    #[test]
    fn test_build_yt_dlp_command_with_max_filesize() {
        let settings = DownloadSettings {
            download_mode: "video".to_string(),
            video_quality: "best".to_string(),
            max_resolution: "1080p".to_string(),
            video_format: "mp4".to_string(),
            audio_format: "mp3".to_string(),
            audio_quality: "0".to_string(),
            download_rate_limit: "unlimited".to_string(),
            max_file_size: "100M".to_string(),
            append_unique_id: false,
            unique_id_type: "native".to_string(),
        };

        let args = build_rate_and_size_args(&settings);

        // Should include max filesize arg
        assert!(args.iter().any(|arg| arg == "--max-filesize"));
        let max_filesize_idx = args.iter().position(|arg| arg == "--max-filesize").unwrap();
        assert_eq!(args[max_filesize_idx + 1], "100M");

        // Should not include rate limit when unlimited
        assert!(!args.iter().any(|arg| arg == "--limit-rate"));
    }

    #[test]
    fn test_build_yt_dlp_command_with_both_limits() {
        let settings = DownloadSettings {
            download_mode: "video".to_string(),
            video_quality: "best".to_string(),
            max_resolution: "1080p".to_string(),
            video_format: "mp4".to_string(),
            audio_format: "mp3".to_string(),
            audio_quality: "0".to_string(),
            download_rate_limit: "25K".to_string(),
            max_file_size: "500M".to_string(),
            append_unique_id: false,
            unique_id_type: "native".to_string(),
        };

        let args = build_rate_and_size_args(&settings);

        // Should include both rate limit and max filesize
        assert!(args.iter().any(|arg| arg == "--limit-rate"));
        assert!(args.iter().any(|arg| arg == "--max-filesize"));

        let rate_limit_idx = args.iter().position(|arg| arg == "--limit-rate").unwrap();
        assert_eq!(args[rate_limit_idx + 1], "25K");

        let max_filesize_idx = args.iter().position(|arg| arg == "--max-filesize").unwrap();
        assert_eq!(args[max_filesize_idx + 1], "500M");
    }

    #[test]
    fn test_build_yt_dlp_command_unlimited_limits() {
        let settings = DownloadSettings {
            download_mode: "video".to_string(),
            video_quality: "best".to_string(),
            max_resolution: "1080p".to_string(),
            video_format: "mp4".to_string(),
            audio_format: "mp3".to_string(),
            audio_quality: "0".to_string(),
            download_rate_limit: "unlimited".to_string(),
            max_file_size: "unlimited".to_string(),
            append_unique_id: false,
            unique_id_type: "native".to_string(),
        };

        let args = build_rate_and_size_args(&settings);

        // Should not include either limit when both are unlimited
        assert!(!args.iter().any(|arg| arg == "--limit-rate"));
        assert!(!args.iter().any(|arg| arg == "--max-filesize"));
    }
}
