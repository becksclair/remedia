use once_cell::sync::Lazy;
use reqwest::Client;
use serde_json::Value;
use std::sync::Mutex;

static CLIENT: Lazy<Client> = Lazy::new(|| {
    Client::builder().user_agent("remedia-redgifs/0.1.0").build().expect("Failed to build reqwest client")
});

static TOKEN: Lazy<Mutex<Option<String>>> = Lazy::new(|| Mutex::new(None));

async fn get_token() -> Result<String, String> {
    {
        let guard = TOKEN.lock().map_err(|e| format!("RedGifs token mutex poisoned: {e}"))?;
        if let Some(token) = &*guard {
            return Ok(token.clone());
        }
    }

    let resp = CLIENT
        .get("https://api.redgifs.com/v2/auth/temporary")
        .send()
        .await
        .map_err(|e| format!("RedGifs auth request failed: {e}"))?;

    if !resp.status().is_success() {
        return Err(format!("RedGifs auth returned non-success status: {}", resp.status()));
    }

    let v: Value = resp.json().await.map_err(|e| format!("Failed to parse RedGifs auth JSON: {e}"))?;

    let token = v
        .get("token")
        .and_then(|t| t.as_str())
        .ok_or_else(|| "RedGifs auth JSON missing 'token' field".to_string())?
        .to_string();

    let mut guard = TOKEN.lock().map_err(|e| format!("RedGifs token mutex poisoned: {e}"))?;
    *guard = Some(token.clone());

    Ok(token)
}

async fn call_api(endpoint: &str, video_id: &str) -> Result<Value, String> {
    // Try with existing/initial token, then invalidate and retry once on 401
    for first_attempt in [true, false] {
        let token = get_token().await?;

        let url = format!("https://api.redgifs.com/v2/{}", endpoint);
        let mut req = CLIENT.get(&url).header("authorization", format!("Bearer {}", token));

        // Mirror yt-dlp's behavior as closely as is reasonable
        req = req
            .header("referer", "https://www.redgifs.com/")
            .header("origin", "https://www.redgifs.com")
            .header("x-customheader", format!("https://www.redgifs.com/watch/{}", video_id));

        let resp = req.send().await.map_err(|e| format!("RedGifs API request failed: {e}"))?;

        if resp.status().as_u16() == 401 && first_attempt {
            // Token expired; clear and retry once
            if let Ok(mut guard) = TOKEN.lock() {
                *guard = None;
            }
            continue;
        }

        if !resp.status().is_success() {
            return Err(format!("RedGifs API returned non-success status {} for {}", resp.status(), url));
        }

        let v: Value = resp.json().await.map_err(|e| format!("Failed to parse RedGifs API JSON: {e}"))?;

        if v.get("error").is_some() {
            return Err(format!("RedGifs API reported error for {}: {:?}", url, v.get("error")));
        }

        return Ok(v);
    }

    Err("RedGifs API call failed after token refresh".to_string())
}

pub async fn fetch_redgifs_thumbnail(video_id: &str) -> Result<Option<String>, String> {
    let endpoint = format!("gifs/{}?views=yes", video_id.to_lowercase());
    let data = call_api(&endpoint, video_id).await?;

    let gif = data.get("gif").ok_or_else(|| "RedGifs API JSON missing 'gif' field".to_string())?;

    // Prefer structured urls.poster / urls.thumbnail when available
    if let Some(urls) = gif.get("urls").and_then(|u| u.as_object()) {
        if let Some(poster) = urls.get("poster").and_then(|u| u.as_str())
            && !poster.is_empty()
        {
            return Ok(Some(poster.to_string()));
        }
        if let Some(thumbnail) = urls.get("thumbnail").and_then(|u| u.as_str())
            && !thumbnail.is_empty()
        {
            return Ok(Some(thumbnail.to_string()));
        }
    }

    // Fallbacks for older/alternate API shapes
    for key in ["mobilePosterUrl", "posterUrl", "miniPosterUrl", "thumb100PosterUrl"] {
        if let Some(url) = gif.get(key).and_then(|u| u.as_str())
            && !url.is_empty()
        {
            return Ok(Some(url.to_string()));
        }
    }

    Ok(None)
}
