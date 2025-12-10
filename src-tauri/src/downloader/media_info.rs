//! Media info extraction from yt-dlp JSON output.

use serde_json::Value;
use tauri::AppHandle;

use crate::logging::{append_yt_dlp_log, log_error_simple, log_warning_simple, ErrorCategory};
use crate::redgifs::fetch_redgifs_thumbnail;
use crate::thumbnail::resolve_thumbnail;

use super::playlist::sanitize_folder_name;

/// Media info extracted from yt-dlp JSON
pub struct ExtractedMediaInfo {
    pub title: String,
    pub thumbnail: String,
    pub preview_url: String,
    pub uploader: Option<String>,
    pub collection_id: Option<String>,
    pub collection_kind: Option<String>,
    pub collection_name: Option<String>,
    pub folder_slug: Option<String>,
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
pub fn extract_media_info_from_value(v: &Value, media_source_url: &str) -> Option<ExtractedMediaInfo> {
    let title = v.get("title").and_then(|t| t.as_str()).filter(|s| !s.is_empty()).unwrap_or(media_source_url).to_string();

    let thumbnail = resolve_thumbnail(v).unwrap_or_default();
    let preview_url = extract_preview_url(v).unwrap_or_default();

    // Extract uploader/channel for display purposes only (not for folder naming)
    // Collection/folder info should only be set by expand_playlist when URL is a playlist/channel
    let uploader = v
        .get("uploader")
        .or_else(|| v.get("channel"))
        .or_else(|| v.get("uploader_id"))
        .and_then(|u| u.as_str())
        .filter(|s| !s.is_empty())
        .map(sanitize_folder_name);

    // Single videos should NOT have collection/folder info - they download to the configured output folder
    // Collection info is only set by parse_playlist_expansion when the URL is detected as a playlist/channel
    Some(ExtractedMediaInfo {
        title,
        thumbnail,
        preview_url,
        uploader,
        collection_id: None,
        collection_kind: None,
        collection_name: None,
        folder_slug: None,
    })
}

/// Apply provider-specific metadata overrides on top of the generic
/// `extract_media_info_from_value` result. This is where we plug in custom
/// behavior for RedGifs, Twitter/X, etc.
pub async fn apply_provider_overrides(
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
                log_warning_simple(
                    app,
                    ErrorCategory::Network,
                    &format!("RedGifs API did not return thumbnail for id {}", id),
                );
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
                log_error_simple(
                    app,
                    ErrorCategory::Network,
                    &format!("RedGifs thumbnail fetch failed for id {}", id),
                    Some(&e.to_string()),
                );
            }
        }
    }

    // Future provider-specific overrides (Twitter/X, etc.) can be added here.
}

#[cfg(test)]
mod tests {
    use super::*;

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
    fn test_extract_media_info_with_uploader_has_no_collection_metadata() {
        // Single videos should NOT get collection/folder metadata - only playlists/channels
        // The uploader is extracted for display purposes, but no folder structure is created
        let json = r#"{
            "title":"Some Video",
            "uploader":"Some Channel"
        }"#;

        let source_url = "https://example.com/watch?v=123";
        let v: serde_json::Value = serde_json::from_str(json).expect("valid media json");
        let info = extract_media_info_from_value(&v, source_url).expect("should parse media json");

        assert_eq!(info.title, "Some Video");
        assert_eq!(info.uploader.as_deref(), Some("Some Channel"));
        // Single videos should not have collection metadata - they download to the configured output folder
        assert!(info.collection_kind.is_none());
        assert!(info.collection_name.is_none());
        assert!(info.folder_slug.is_none());
        assert!(info.collection_id.is_none());
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
}
