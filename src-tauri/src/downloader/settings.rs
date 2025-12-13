//! Download settings validation and yt-dlp argument building.

use serde::{Deserialize, Serialize};

use crate::error::DownloaderError;

/// Maximum URL length to prevent abuse
pub const MAX_URL_LENGTH: usize = 4096;

/// Maximum output path length (OS limits)
pub const MAX_OUTPUT_PATH_LENGTH: usize = 1024;

/// Download settings from frontend
#[derive(Debug, Deserialize, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct DownloadSettings {
    pub download_mode: String,  // "video" | "audio"
    pub video_quality: String,  // "best" | "high" | "medium" | "low"
    pub max_resolution: String, // "2160p" | "1440p" | "1080p" | "720p" | "480p" | "no-limit"
    pub video_format: String,   // "mp4" | "mkv" | "webm" | "best"
    pub audio_format: String,   // "mp3" | "m4a" | "opus" | "best"
    pub audio_quality: String,  // "0" | "2" | "5" | "9"
    #[serde(default = "default_unlimited")]
    pub download_rate_limit: String, // "50K" | "1M" | ... | "unlimited"
    #[serde(default = "default_unlimited")]
    pub max_file_size: String, // "50M" | "1G" | ... | "unlimited"
    #[serde(default = "default_true")]
    pub append_unique_id: bool, // Append unique ID to filenames
    #[serde(default = "default_native")]
    pub unique_id_type: String, // "native" = yt-dlp's %(id)s, "hash" = FNV-1a hash
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
    /// Default settings for remote control API
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

/// Validate download settings fields
pub fn validate_settings(settings: &DownloadSettings) -> Result<(), DownloaderError> {
    // Validate download mode
    if !matches!(settings.download_mode.as_str(), "video" | "audio") {
        return Err(DownloaderError::invalid_settings(format!("Invalid download_mode: {}", settings.download_mode)));
    }

    // Validate video quality
    if !matches!(settings.video_quality.as_str(), "best" | "high" | "medium" | "low") {
        return Err(DownloaderError::invalid_settings(format!("Invalid video_quality: {}", settings.video_quality)));
    }

    // Validate max resolution
    if !matches!(settings.max_resolution.as_str(), "2160p" | "1440p" | "1080p" | "720p" | "480p" | "no-limit") {
        return Err(DownloaderError::invalid_settings(format!("Invalid max_resolution: {}", settings.max_resolution)));
    }

    // Validate video format
    if !matches!(settings.video_format.as_str(), "mp4" | "mkv" | "webm" | "best") {
        return Err(DownloaderError::invalid_settings(format!("Invalid video_format: {}", settings.video_format)));
    }

    // Validate audio format
    if !matches!(settings.audio_format.as_str(), "mp3" | "m4a" | "opus" | "best") {
        return Err(DownloaderError::invalid_settings(format!("Invalid audio_format: {}", settings.audio_format)));
    }

    // Validate audio quality
    if !matches!(settings.audio_quality.as_str(), "0" | "2" | "5" | "9") {
        return Err(DownloaderError::invalid_settings(format!("Invalid audio_quality: {}", settings.audio_quality)));
    }

    // Validate download rate limit
    if !validate_size_or_rate(&settings.download_rate_limit) {
        return Err(DownloaderError::invalid_settings(format!(
            "Invalid download_rate_limit: {}",
            settings.download_rate_limit
        )));
    }

    // Validate max file size
    if !validate_size_or_rate(&settings.max_file_size) {
        return Err(DownloaderError::invalid_settings(format!("Invalid max_file_size: {}", settings.max_file_size)));
    }

    // Validate unique_id_type
    if !matches!(settings.unique_id_type.as_str(), "native" | "hash") {
        return Err(DownloaderError::invalid_settings(format!("Invalid unique_id_type: {}", settings.unique_id_type)));
    }

    Ok(())
}

/// Validate a size or rate string (e.g., "50K", "1M", "unlimited")
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

/// Characters that could be dangerous if passed to a shell.
/// Although we use `Command::arg()` which doesn't invoke a shell,
/// rejecting these provides defense-in-depth.
const DANGEROUS_SHELL_CHARS: &[char] = &['|', '&', ';', '$', '`', '\n', '\r', '(', ')', '<', '>'];

/// Validate URL input
pub fn validate_url(url: &str) -> Result<(), DownloaderError> {
    if url.trim().is_empty() {
        return Err(DownloaderError::invalid_url("URL cannot be empty"));
    }

    // Basic URL format validation
    if !url.starts_with("http://") && !url.starts_with("https://") {
        return Err(DownloaderError::invalid_url("URL must start with http:// or https://"));
    }

    // Length check to prevent abuse
    if url.len() > MAX_URL_LENGTH {
        return Err(DownloaderError::invalid_url(format!("URL is too long (max {} characters)", MAX_URL_LENGTH)));
    }

    // Defense-in-depth: reject shell metacharacters even though Command::arg() is safe
    if url.chars().any(|c| DANGEROUS_SHELL_CHARS.contains(&c)) {
        return Err(DownloaderError::invalid_url("URL contains invalid characters"));
    }

    Ok(())
}

/// Validate output location
pub fn validate_output_location(location: &str) -> Result<(), DownloaderError> {
    if location.trim().is_empty() {
        return Err(DownloaderError::invalid_path("Output location cannot be empty"));
    }

    // Length check
    if location.len() > MAX_OUTPUT_PATH_LENGTH {
        return Err(DownloaderError::invalid_path(format!(
            "Output location path is too long (max {} characters)",
            MAX_OUTPUT_PATH_LENGTH
        )));
    }

    Ok(())
}

/// Generate a short, idempotent unique ID from a URL using FNV-1a hash.
/// Returns an 8-character base36 string (lowercase alphanumeric).
/// This is extremely fast: FNV-1a is a simple multiply-xor loop.
/// 8 chars in base36 = 36^8 = ~2.8 trillion unique values.
pub fn generate_unique_id(url: &str) -> String {
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

/// Build format selection arguments for yt-dlp based on settings
pub fn build_format_args(settings: &DownloadSettings) -> Vec<String> {
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
            // --merge-output-format controls container when merging separate video+audio streams
            // --remux-video ensures final output is remuxed to requested container
            args.push("--merge-output-format".to_string());
            args.push(settings.video_format.clone());
            args.push("--remux-video".to_string());
            args.push(settings.video_format.clone());
        }
    }

    args
}

/// Build rate and size limit arguments for yt-dlp
pub fn build_rate_and_size_args(settings: &DownloadSettings) -> Vec<String> {
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
    fn test_build_format_args_video_container_mp4() {
        let mut settings = default_settings();
        settings.video_format = "mp4".to_string();

        let args = build_format_args(&settings);

        // Both flags should be present for proper container control
        assert!(args.contains(&"--merge-output-format".to_string()));
        assert!(args.contains(&"--remux-video".to_string()));

        // Verify ordering: --merge-output-format comes before --remux-video
        let merge_idx = args.iter().position(|a| a == "--merge-output-format").unwrap();
        let remux_idx = args.iter().position(|a| a == "--remux-video").unwrap();
        assert!(merge_idx < remux_idx, "--merge-output-format should come before --remux-video");

        // Verify values follow their flags
        assert_eq!(args[merge_idx + 1], "mp4");
        assert_eq!(args[remux_idx + 1], "mp4");
    }

    #[test]
    fn test_build_format_args_video_container_mkv() {
        let mut settings = default_settings();
        settings.video_format = "mkv".to_string();

        let args = build_format_args(&settings);

        let merge_idx = args.iter().position(|a| a == "--merge-output-format").unwrap();
        let remux_idx = args.iter().position(|a| a == "--remux-video").unwrap();
        assert_eq!(args[merge_idx + 1], "mkv");
        assert_eq!(args[remux_idx + 1], "mkv");
    }

    #[test]
    fn test_build_format_args_video_container_webm() {
        let mut settings = default_settings();
        settings.video_format = "webm".to_string();

        let args = build_format_args(&settings);

        let merge_idx = args.iter().position(|a| a == "--merge-output-format").unwrap();
        let remux_idx = args.iter().position(|a| a == "--remux-video").unwrap();
        assert_eq!(args[merge_idx + 1], "webm");
        assert_eq!(args[remux_idx + 1], "webm");
    }

    #[test]
    fn test_build_format_args_video_best_no_container_flags() {
        let settings = default_settings(); // video_format = "best"

        let args = build_format_args(&settings);

        // Neither flag should be present when format is "best"
        assert!(!args.contains(&"--merge-output-format".to_string()));
        assert!(!args.contains(&"--remux-video".to_string()));
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
    fn test_build_rate_and_size_args_with_rate_limit() {
        let mut settings = default_settings();
        settings.download_rate_limit = "50M".to_string();

        let args = build_rate_and_size_args(&settings);

        // Should include rate limit arg
        assert!(args.iter().any(|arg| arg == "--limit-rate"));
        let rate_limit_idx = args.iter().position(|arg| arg == "--limit-rate").unwrap();
        assert_eq!(args[rate_limit_idx + 1], "50M");

        // Should not include max filesize when unlimited
        assert!(!args.iter().any(|arg| arg == "--max-filesize"));
    }

    #[test]
    fn test_build_rate_and_size_args_with_max_filesize() {
        let mut settings = default_settings();
        settings.max_file_size = "100M".to_string();

        let args = build_rate_and_size_args(&settings);

        // Should include max filesize arg
        assert!(args.iter().any(|arg| arg == "--max-filesize"));
        let max_filesize_idx = args.iter().position(|arg| arg == "--max-filesize").unwrap();
        assert_eq!(args[max_filesize_idx + 1], "100M");

        // Should not include rate limit when unlimited
        assert!(!args.iter().any(|arg| arg == "--limit-rate"));
    }

    #[test]
    fn test_build_rate_and_size_args_with_both_limits() {
        let mut settings = default_settings();
        settings.download_rate_limit = "25K".to_string();
        settings.max_file_size = "500M".to_string();

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
    fn test_build_rate_and_size_args_unlimited_limits() {
        let settings = default_settings();

        let args = build_rate_and_size_args(&settings);

        // Should not include either limit when both are unlimited
        assert!(!args.iter().any(|arg| arg == "--limit-rate"));
        assert!(!args.iter().any(|arg| arg == "--max-filesize"));
    }

    // ========================================
    // URL Validation Tests
    // ========================================

    #[test]
    fn test_validate_url_valid_http() {
        assert!(validate_url("http://example.com").is_ok());
    }

    #[test]
    fn test_validate_url_valid_https() {
        assert!(validate_url("https://example.com/video").is_ok());
    }

    #[test]
    fn test_validate_url_with_query_params() {
        assert!(validate_url("https://example.com/video?id=123&t=45").is_ok());
    }

    #[test]
    fn test_validate_url_empty() {
        let result = validate_url("");
        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("empty"));
    }

    #[test]
    fn test_validate_url_whitespace_only() {
        let result = validate_url("   \t\n");
        assert!(result.is_err());
    }

    #[test]
    fn test_validate_url_missing_protocol() {
        let result = validate_url("example.com/video");
        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("http"));
    }

    #[test]
    fn test_validate_url_invalid_protocol() {
        assert!(validate_url("ftp://example.com").is_err());
        assert!(validate_url("file:///path/to/file").is_err());
    }

    #[test]
    fn test_validate_url_too_long() {
        let long_url = format!("https://example.com/{}", "x".repeat(MAX_URL_LENGTH));
        let result = validate_url(&long_url);
        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("too long"));
    }

    #[test]
    fn test_validate_url_max_length_ok() {
        // URL just under the limit should be OK
        let base = "https://example.com/";
        let padding_len = MAX_URL_LENGTH - base.len() - 1;
        let url = format!("{}{}", base, "a".repeat(padding_len));
        assert!(validate_url(&url).is_ok());
    }

    #[test]
    fn test_validate_url_rejects_shell_metacharacters() {
        // Pipe
        assert!(validate_url("https://example.com/video|cat").is_err());
        // Ampersand
        assert!(validate_url("https://example.com/video&ls").is_err());
        // Semicolon
        assert!(validate_url("https://example.com/video;rm -rf /").is_err());
        // Dollar sign
        assert!(validate_url("https://example.com/video$HOME").is_err());
        // Backtick
        assert!(validate_url("https://example.com/video`whoami`").is_err());
        // Newline
        assert!(validate_url("https://example.com/video\nls").is_err());
        // Carriage return
        assert!(validate_url("https://example.com/video\rls").is_err());
        // Parentheses
        assert!(validate_url("https://example.com/video(test)").is_err());
        // Angle brackets
        assert!(validate_url("https://example.com/video<test>").is_err());
    }

    #[test]
    fn test_validate_url_allows_safe_special_chars() {
        // Query params with = and # are fine (common in URLs)
        assert!(validate_url("https://example.com/video?id=123").is_ok());
        assert!(validate_url("https://example.com/video#section").is_ok());
        // Percent encoding is fine
        assert!(validate_url("https://example.com/video%20name").is_ok());
        // Forward slashes are fine
        assert!(validate_url("https://example.com/path/to/video").is_ok());
    }

    // ========================================
    // Output Location Validation Tests
    // ========================================

    #[test]
    fn test_validate_output_location_valid() {
        assert!(validate_output_location("/home/user/downloads").is_ok());
        assert!(validate_output_location("C:\\Users\\User\\Downloads").is_ok());
    }

    #[test]
    fn test_validate_output_location_empty() {
        let result = validate_output_location("");
        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("empty"));
    }

    #[test]
    fn test_validate_output_location_whitespace_only() {
        assert!(validate_output_location("   \t").is_err());
    }

    #[test]
    fn test_validate_output_location_too_long() {
        let long_path = "/".to_string() + &"x".repeat(MAX_OUTPUT_PATH_LENGTH);
        let result = validate_output_location(&long_path);
        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("too long"));
    }

    // ========================================
    // Settings Field Validation Tests
    // ========================================

    #[test]
    fn test_validate_settings_invalid_download_mode() {
        let mut settings = default_settings();
        settings.download_mode = "invalid".to_string();

        let result = validate_settings(&settings);
        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("download_mode"));
    }

    #[test]
    fn test_validate_settings_invalid_video_quality() {
        let mut settings = default_settings();
        settings.video_quality = "ultra-hd".to_string();

        let result = validate_settings(&settings);
        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("video_quality"));
    }

    #[test]
    fn test_validate_settings_invalid_max_resolution() {
        let mut settings = default_settings();
        settings.max_resolution = "8k".to_string();

        let result = validate_settings(&settings);
        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("max_resolution"));
    }

    #[test]
    fn test_validate_settings_invalid_video_format() {
        let mut settings = default_settings();
        settings.video_format = "avi".to_string();

        let result = validate_settings(&settings);
        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("video_format"));
    }

    #[test]
    fn test_validate_settings_invalid_audio_format() {
        let mut settings = default_settings();
        settings.audio_format = "wav".to_string();

        let result = validate_settings(&settings);
        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("audio_format"));
    }

    #[test]
    fn test_validate_settings_invalid_audio_quality() {
        let mut settings = default_settings();
        settings.audio_quality = "10".to_string();

        let result = validate_settings(&settings);
        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("audio_quality"));
    }

    #[test]
    fn test_validate_settings_invalid_unique_id_type() {
        let mut settings = default_settings();
        settings.unique_id_type = "weird".to_string();

        let result = validate_settings(&settings);
        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("unique_id_type"));
    }

    #[test]
    fn test_validate_settings_valid_unique_id_type_hash() {
        let mut settings = default_settings();
        settings.unique_id_type = "hash".to_string();

        assert!(validate_settings(&settings).is_ok());
    }

    #[test]
    fn test_validate_settings_all_valid_combinations() {
        // Test all valid values for each field
        for mode in ["video", "audio"] {
            let mut settings = default_settings();
            settings.download_mode = mode.to_string();
            assert!(validate_settings(&settings).is_ok(), "Failed for mode: {}", mode);
        }

        for quality in ["best", "high", "medium", "low"] {
            let mut settings = default_settings();
            settings.video_quality = quality.to_string();
            assert!(validate_settings(&settings).is_ok(), "Failed for quality: {}", quality);
        }

        for res in ["2160p", "1440p", "1080p", "720p", "480p", "no-limit"] {
            let mut settings = default_settings();
            settings.max_resolution = res.to_string();
            assert!(validate_settings(&settings).is_ok(), "Failed for resolution: {}", res);
        }

        for format in ["mp4", "mkv", "webm", "best"] {
            let mut settings = default_settings();
            settings.video_format = format.to_string();
            assert!(validate_settings(&settings).is_ok(), "Failed for video format: {}", format);
        }

        for format in ["mp3", "m4a", "opus", "best"] {
            let mut settings = default_settings();
            settings.audio_format = format.to_string();
            assert!(validate_settings(&settings).is_ok(), "Failed for audio format: {}", format);
        }

        for quality in ["0", "2", "5", "9"] {
            let mut settings = default_settings();
            settings.audio_quality = quality.to_string();
            assert!(validate_settings(&settings).is_ok(), "Failed for audio quality: {}", quality);
        }
    }

    #[test]
    fn test_download_settings_remote_defaults() {
        let settings = DownloadSettings::remote_defaults();
        // Should be valid
        assert!(validate_settings(&settings).is_ok());
        // Should have sensible defaults
        assert_eq!(settings.download_mode, "video");
        assert_eq!(settings.video_quality, "best");
        assert_eq!(settings.max_resolution, "no-limit");
    }
}
