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
    let body = resp.text().await.map_err(|e| format!("Failed to read RedGifs auth body: {e}"))?;

    // Newer RedGifs API returns a raw JWT string, older docs show a JSON object with a `token` field.
    // Support both for robustness.
    let body_trimmed = body.trim();

    let token = if body_trimmed.starts_with('{') {
        let v: Value = serde_json::from_str(body_trimmed)
            .map_err(|e| format!("Failed to parse RedGifs auth JSON: {e}. Body: {}", body_trimmed))?;
        v.get("token")
            .and_then(|t| t.as_str())
            .ok_or_else(|| "RedGifs auth JSON missing 'token' field".to_string())?
            .to_string()
    } else {
        if body_trimmed.is_empty() {
            return Err("RedGifs auth returned empty body".to_string());
        }
        body_trimmed.to_string()
    };

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
    let mut last_err: Option<String> = None;
    let mut any_succeeded = false;

    for id_variant in [video_id, &video_id.to_lowercase()] {
        let endpoint = format!("gifs/{}?views=yes", id_variant);
        let data = match call_api(&endpoint, video_id).await {
            Ok(d) => d,
            Err(e) => {
                last_err = Some(e);
                continue;
            }
        };

        any_succeeded = true;

        let gif = match data.get("gif") {
            Some(g) => g,
            None => {
                last_err = Some("RedGifs API JSON missing 'gif' field".to_string());
                continue;
            }
        };

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

        for key in ["mobilePosterUrl", "posterUrl", "miniPosterUrl", "thumb100PosterUrl"] {
            if let Some(url) = gif.get(key).and_then(|u| u.as_str())
                && !url.is_empty()
            {
                return Ok(Some(url.to_string()));
            }
        }
    }

    if any_succeeded {
        Ok(None)
    } else if let Some(err) = last_err {
        Err(err)
    } else {
        Ok(None)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::{fs, path::PathBuf};

    #[tokio::test]
    #[ignore]
    async fn redgifs_integration_fetch_thumbnail_and_save() {
        let id = "forthrightsomberhapuka";
        let url = fetch_redgifs_thumbnail(id)
            .await
            .expect("RedGifs API call failed")
            .expect("No thumbnail URL returned from RedGifs API");

        println!("RedGifs thumbnail URL: {}", url);

        let resp = CLIENT.get(&url).send().await.expect("Failed to download thumbnail image");
        assert!(resp.status().is_success(), "Thumbnail request failed: {}", resp.status());

        let bytes = resp.bytes().await.expect("Failed to read thumbnail bytes");

        let out_dir = PathBuf::from("tests-output");
        if let Err(e) = fs::create_dir_all(&out_dir) {
            eprintln!("Failed to create tests-output dir: {}", e);
        }
        let out_path = out_dir.join("redgifs-forthrightsomberhapuka.jpg");
        fs::write(&out_path, &bytes).expect("Failed to write thumbnail file");

        println!("Saved RedGifs thumbnail to {:?}", out_path);
    }
}
