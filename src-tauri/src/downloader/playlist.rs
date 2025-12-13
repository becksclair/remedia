//! Playlist expansion and parsing for yt-dlp output.

use std::collections::HashSet;

use serde::{Deserialize, Serialize};
use serde_json::Value;

/// Safety cap for playlist expansion to avoid unbounded queue growth
pub const MAX_PLAYLIST_ITEMS: usize = 500;

/// A single item in a playlist
#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct PlaylistItem {
    pub url: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub title: Option<String>,
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
pub fn sanitize_folder_name(name: &str) -> String {
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
    let mut url = entry
        .get("webpage_url")
        .and_then(|u| u.as_str())
        .filter(|u| u.starts_with("http"))
        .map(|u| u.to_string());

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

    Some(PlaylistItem { url, title })
}

/// Parse yt-dlp `-J --flat-playlist` JSON into playlist expansion with metadata
pub fn parse_playlist_expansion(json_str: &str) -> Result<PlaylistExpansion, String> {
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

#[cfg(test)]
mod tests {
    use super::*;

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
    fn test_parse_playlist_expansion_respects_max_items() {
        let mut entries = String::new();
        for i in 0..(MAX_PLAYLIST_ITEMS + 10) {
            if !entries.is_empty() {
                entries.push(',');
            }
            entries.push_str(&format!(
                r#"{{"id":"id{}","webpage_url":"https://example.com/{}"}}"#,
                i, i
            ));
        }

        let json = format!(
            r#"{{"_type":"playlist","entries":[{}]}}"#,
            entries
        );

        let expansion = parse_playlist_expansion(&json).expect("should parse playlist JSON");
        assert_eq!(expansion.entries.len(), MAX_PLAYLIST_ITEMS);
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
}
