use serde_json::Value;

/// Resolve a thumbnail URL from yt-dlp JSON output, including extractor-specific fallbacks.
pub fn resolve_thumbnail(v: &Value) -> Option<String> {
    // First, honor direct fields
    let mut thumbnail = v.get("thumbnail").and_then(|t| t.as_str()).filter(|s| !s.is_empty()).map(|s| s.to_string());

    if thumbnail.is_none() {
        thumbnail = v
            .get("thumbnails")
            .and_then(|arr| arr.as_array())
            .and_then(|thumbs| thumbs.last())
            .and_then(|t| t.get("url"))
            .and_then(|u| u.as_str())
            .filter(|s| !s.is_empty())
            .map(|s| s.to_string());
    }

    if thumbnail.is_none() {
        thumbnail = v.get("thumbnail_url").and_then(|t| t.as_str()).filter(|s| !s.is_empty()).map(|s| s.to_string());
    }

    // Extractor-specific fallbacks
    if thumbnail.is_none() && v.get("extractor").and_then(|e| e.as_str()) == Some("RedGifs") {
        // Prefer format-derived ID
        let mut candidates: Vec<String> = Vec::new();

        if let Some(formats) = v.get("formats").and_then(|f| f.as_array()) {
            for format in formats {
                if let Some(url) = format.get("url").and_then(|u| u.as_str())
                    && url.contains("redgifs.com")
                    && url.ends_with(".mp4")
                    && let Some(filename) = url.split('/').next_back()
                {
                    let id_part = filename.trim_end_matches(".mp4").trim_end_matches("-mobile");
                    candidates.push(id_part.to_string());
                    break;
                }
            }
        }

        if candidates.is_empty()
            && let Some(id) = v.get("id").and_then(|i| i.as_str())
        {
            candidates.push(id.to_string());
        }
        if candidates.is_empty()
            && let Some(display_id) = v.get("display_id").and_then(|i| i.as_str())
        {
            candidates.push(display_id.to_string());
        }

        for id in candidates {
            let id = id.trim();
            if id.is_empty() {
                continue;
            }
            thumbnail = Some(format!("https://thumbs2.redgifs.com/{}-mobile.jpg", id));
            break;
        }
    }

    thumbnail.filter(|s| s.starts_with("http"))
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn test_resolve_thumbnail_direct_field() {
        let v = json!({
            "thumbnail": "https://example.com/thumb.jpg"
        });
        assert_eq!(resolve_thumbnail(&v), Some("https://example.com/thumb.jpg".to_string()));
    }

    #[test]
    fn test_resolve_thumbnail_empty_string_ignored() {
        let v = json!({
            "thumbnail": ""
        });
        assert_eq!(resolve_thumbnail(&v), None);
    }

    #[test]
    fn test_resolve_thumbnail_from_thumbnails_array() {
        let v = json!({
            "thumbnails": [
                {"url": "https://example.com/small.jpg"},
                {"url": "https://example.com/large.jpg"}
            ]
        });
        // Should pick last (highest resolution)
        assert_eq!(resolve_thumbnail(&v), Some("https://example.com/large.jpg".to_string()));
    }

    #[test]
    fn test_resolve_thumbnail_from_thumbnail_url() {
        let v = json!({
            "thumbnail_url": "https://example.com/alt.jpg"
        });
        assert_eq!(resolve_thumbnail(&v), Some("https://example.com/alt.jpg".to_string()));
    }

    #[test]
    fn test_resolve_thumbnail_priority_order() {
        // thumbnail takes priority over thumbnails and thumbnail_url
        let v = json!({
            "thumbnail": "https://example.com/primary.jpg",
            "thumbnails": [{"url": "https://example.com/array.jpg"}],
            "thumbnail_url": "https://example.com/alt.jpg"
        });
        assert_eq!(resolve_thumbnail(&v), Some("https://example.com/primary.jpg".to_string()));
    }

    #[test]
    fn test_resolve_thumbnail_fallback_to_thumbnails() {
        // When thumbnail is empty, fall back to thumbnails array
        let v = json!({
            "thumbnail": "",
            "thumbnails": [{"url": "https://example.com/array.jpg"}]
        });
        assert_eq!(resolve_thumbnail(&v), Some("https://example.com/array.jpg".to_string()));
    }

    #[test]
    fn test_resolve_thumbnail_no_valid_source() {
        let v = json!({
            "title": "Some Video"
        });
        assert_eq!(resolve_thumbnail(&v), None);
    }

    #[test]
    fn test_resolve_thumbnail_non_http_filtered() {
        let v = json!({
            "thumbnail": "file:///local/path.jpg"
        });
        assert_eq!(resolve_thumbnail(&v), None);
    }

    #[test]
    fn test_resolve_thumbnail_https_accepted() {
        let v = json!({
            "thumbnail": "https://secure.example.com/thumb.jpg"
        });
        assert_eq!(resolve_thumbnail(&v), Some("https://secure.example.com/thumb.jpg".to_string()));
    }

    #[test]
    fn test_resolve_thumbnail_empty_thumbnails_array() {
        let v = json!({
            "thumbnails": []
        });
        assert_eq!(resolve_thumbnail(&v), None);
    }

    #[test]
    fn test_resolve_thumbnail_thumbnails_missing_url() {
        let v = json!({
            "thumbnails": [{"width": 100, "height": 100}]
        });
        assert_eq!(resolve_thumbnail(&v), None);
    }

    #[test]
    fn test_redgifs_fallback_from_formats() {
        let v = json!({
            "extractor": "RedGifs",
            "formats": [
                {"url": "https://files.redgifs.com/SomeGifId.mp4"}
            ]
        });
        assert_eq!(resolve_thumbnail(&v), Some("https://thumbs2.redgifs.com/SomeGifId-mobile.jpg".to_string()));
    }

    #[test]
    fn test_redgifs_fallback_strips_mobile_suffix() {
        let v = json!({
            "extractor": "RedGifs",
            "formats": [
                {"url": "https://files.redgifs.com/TestId-mobile.mp4"}
            ]
        });
        assert_eq!(resolve_thumbnail(&v), Some("https://thumbs2.redgifs.com/TestId-mobile.jpg".to_string()));
    }

    #[test]
    fn test_redgifs_fallback_from_id() {
        let v = json!({
            "extractor": "RedGifs",
            "id": "FallbackId"
        });
        assert_eq!(resolve_thumbnail(&v), Some("https://thumbs2.redgifs.com/FallbackId-mobile.jpg".to_string()));
    }

    #[test]
    fn test_redgifs_fallback_from_display_id() {
        let v = json!({
            "extractor": "RedGifs",
            "display_id": "DisplayFallback"
        });
        assert_eq!(resolve_thumbnail(&v), Some("https://thumbs2.redgifs.com/DisplayFallback-mobile.jpg".to_string()));
    }

    #[test]
    fn test_redgifs_prefers_format_url_over_id() {
        let v = json!({
            "extractor": "RedGifs",
            "id": "FallbackId",
            "formats": [
                {"url": "https://files.redgifs.com/PreferredId.mp4"}
            ]
        });
        assert_eq!(resolve_thumbnail(&v), Some("https://thumbs2.redgifs.com/PreferredId-mobile.jpg".to_string()));
    }

    #[test]
    fn test_redgifs_not_triggered_for_other_extractors() {
        let v = json!({
            "extractor": "YouTube",
            "id": "dQw4w9WgXcQ"
        });
        // Should not generate RedGifs thumbnail URL
        assert_eq!(resolve_thumbnail(&v), None);
    }

    #[test]
    fn test_redgifs_empty_id_ignored() {
        let v = json!({
            "extractor": "RedGifs",
            "id": "   "
        });
        assert_eq!(resolve_thumbnail(&v), None);
    }

    #[test]
    fn test_redgifs_with_direct_thumbnail_uses_it() {
        // If RedGifs provides a direct thumbnail, use it instead of fallback
        let v = json!({
            "extractor": "RedGifs",
            "thumbnail": "https://thumbs.redgifs.com/direct.jpg",
            "id": "SomeId"
        });
        assert_eq!(resolve_thumbnail(&v), Some("https://thumbs.redgifs.com/direct.jpg".to_string()));
    }
}
