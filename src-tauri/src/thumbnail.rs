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
