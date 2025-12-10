//! Progress parsing utilities for yt-dlp output.

/// Parse progress percentage from yt-dlp progress line.
/// Returns None if line doesn't contain valid progress.
///
/// Progress template emits strings like:
/// "remedia-12.3%-1:23" or "download:remedia-12.3%-1:23".
/// Find the marker anywhere in the line to be resilient to prefix changes.
pub fn parse_progress_percent(line: &str) -> Option<f64> {
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

/// Check if a stderr line should be emitted to the frontend.
/// Filters to only important lines (errors, warnings, failures).
pub fn should_emit_stderr(line: &str) -> bool {
    let line_lower = line.to_lowercase();
    line_lower.contains("error") || line_lower.contains("warning") || line_lower.contains("failed")
}

#[cfg(test)]
mod tests {
    use super::*;

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
    fn test_should_emit_stderr() {
        assert!(should_emit_stderr("ERROR: Something went wrong"));
        assert!(should_emit_stderr("WARNING: Deprecated feature"));
        assert!(should_emit_stderr("Download failed"));
        assert!(!should_emit_stderr("[download] Downloading video 1 of 3"));
        assert!(!should_emit_stderr("[info] Metadata downloaded"));
    }
}
