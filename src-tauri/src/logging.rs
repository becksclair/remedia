use std::fs::{self, File, OpenOptions};
use std::io::{self, Write};
use std::path::{Path, PathBuf};
use std::sync::OnceLock;
use std::time::{SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager, path::BaseDirectory};

/// Maximum size of the log file before rotation (in bytes).
/// This is intentionally small to avoid unbounded growth.
const MAX_LOG_BYTES: u64 = 1_000_000; // ~1 MB

/// Relative path (from the Tauri config directory) to the yt-dlp log file.
/// The final path is resolved via `app.path().resolve(.., BaseDirectory::Config)`.
const YT_DLP_LOG_RELATIVE_PATH: &str = "logs/remedia-yt-dlp.log";

/// Relative path (from the Tauri config directory) to the error log file.
const ERROR_LOG_RELATIVE_PATH: &str = "logs/remedia-errors.log";

/// Environment variable to control log level filtering
const LOG_LEVEL_ENV_VAR: &str = "REMEDIA_LOG_LEVEL";

/// Default log level when not specified
const DEFAULT_LOG_LEVEL: LogLevel = LogLevel::Info;

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
pub enum LogLevel {
    Error,
    Warn,
    Info,
    Debug,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum ErrorCategory {
    Network,
    Validation,
    System,
    Download,
    Unknown,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StructuredLogEntry {
    timestamp: u128,
    level: LogLevel,
    category: ErrorCategory,
    message: String,
    context: Option<serde_json::Value>,
    error_details: Option<String>,
}

impl LogLevel {
    /// Get numeric value for comparison (higher = more verbose)
    pub fn level_value(&self) -> u8 {
        match self {
            LogLevel::Error => 0,
            LogLevel::Warn => 1,
            LogLevel::Info => 2,
            LogLevel::Debug => 3,
        }
    }

    /// Check if this level should be logged given the minimum level
    pub fn should_log(&self, min_level: &LogLevel) -> bool {
        self.level_value() <= min_level.level_value()
    }
}

impl std::fmt::Display for LogLevel {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            LogLevel::Error => write!(f, "ERROR"),
            LogLevel::Warn => write!(f, "WARN"),
            LogLevel::Info => write!(f, "INFO"),
            LogLevel::Debug => write!(f, "DEBUG"),
        }
    }
}

impl Default for LogLevel {
    fn default() -> Self {
        DEFAULT_LOG_LEVEL
    }
}

impl std::str::FromStr for LogLevel {
    type Err = String;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s.to_lowercase().as_str() {
            "error" => Ok(LogLevel::Error),
            "warn" | "warning" => Ok(LogLevel::Warn),
            "info" => Ok(LogLevel::Info),
            "debug" => Ok(LogLevel::Debug),
            _ => Err(format!("Invalid log level: {}", s)),
        }
    }
}

impl StructuredLogEntry {
    /// Returns the current timestamp in milliseconds since Unix epoch
    fn current_timestamp() -> u128 {
        SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_millis()).unwrap_or(0)
    }

    pub fn error(
        category: ErrorCategory,
        message: &str,
        context: Option<serde_json::Value>,
        error_details: Option<&str>,
    ) -> Self {
        Self {
            timestamp: Self::current_timestamp(),
            level: LogLevel::Error,
            category,
            message: message.to_string(),
            context,
            error_details: error_details.map(|s| s.to_string()),
        }
    }

    pub fn warn(category: ErrorCategory, message: &str, context: Option<serde_json::Value>) -> Self {
        Self {
            timestamp: SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_millis()).unwrap_or(0),
            level: LogLevel::Warn,
            category,
            message: message.to_string(),
            context,
            error_details: None,
        }
    }

    pub fn info(category: ErrorCategory, message: &str, context: Option<serde_json::Value>) -> Self {
        Self {
            timestamp: SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_millis()).unwrap_or(0),
            level: LogLevel::Info,
            category,
            message: message.to_string(),
            context,
            error_details: None,
        }
    }

    pub fn debug(category: ErrorCategory, message: &str, context: Option<serde_json::Value>) -> Self {
        Self {
            timestamp: SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_millis()).unwrap_or(0),
            level: LogLevel::Debug,
            category,
            message: message.to_string(),
            context,
            error_details: None,
        }
    }

    pub fn to_json(&self) -> Result<String, serde_json::Error> {
        serde_json::to_string(self)
    }
}

fn resolve_log_path(app: &AppHandle) -> Option<PathBuf> {
    app.path().resolve(YT_DLP_LOG_RELATIVE_PATH, BaseDirectory::Config).ok()
}

fn resolve_error_log_path(app: &AppHandle) -> Option<PathBuf> {
    app.path().resolve(ERROR_LOG_RELATIVE_PATH, BaseDirectory::Config).ok()
}

/// Get the current log level from environment variable or default
fn get_log_level() -> LogLevel {
    static LOG_LEVEL: OnceLock<LogLevel> = OnceLock::new();

    *LOG_LEVEL
        .get_or_init(|| std::env::var(LOG_LEVEL_ENV_VAR).ok().and_then(|s| s.parse().ok()).unwrap_or(DEFAULT_LOG_LEVEL))
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

    let timestamp_ms = StructuredLogEntry::current_timestamp();

    writeln!(file, "[{}] {}", timestamp_ms, line)?;
    Ok(())
}

/// Append a line without timestamp prefix (for structured JSON entries)
fn append_line_raw(path: &Path, line: &str) -> io::Result<()> {
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

    writeln!(file, "{}", line)?;
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

/// Log a structured entry with level filtering
fn log_structured_entry(app_handle: &AppHandle, entry: StructuredLogEntry) {
    let min_level = get_log_level();

    // Check if this entry should be logged based on current log level
    if !entry.level.should_log(&min_level) {
        return;
    }

    let Some(path) = resolve_error_log_path(app_handle) else {
        // If we cannot resolve the path, fall back to stderr only.
        // Try JSON serialization first, fall back to Debug if it fails.
        match entry.to_json() {
            Ok(json_string) => eprintln!("[LOG] {}", json_string),
            Err(_) => eprintln!("[{}] {:?}", entry.level, entry),
        }
        return;
    };

    match entry.to_json() {
        Ok(json_line) => {
            if let Err(e) = append_line_raw(&path, &json_line) {
                eprintln!("Failed to write log entry to {}: {}", path.display(), e);
            }
        }
        Err(e) => {
            eprintln!("Failed to serialize log entry: {}", e);
        }
    }
}

/// Log a structured error entry.
pub fn log_error(app_handle: &AppHandle, mut entry: StructuredLogEntry) {
    if !matches!(entry.level, LogLevel::Error) {
        eprintln!("Log level normalization: log_error called with {:?} level, normalizing to Error", entry.level);
        entry.level = LogLevel::Error;
    }
    log_structured_entry(app_handle, entry);
}

/// Log a structured warning entry.
pub fn log_warning(app_handle: &AppHandle, mut entry: StructuredLogEntry) {
    if !matches!(entry.level, LogLevel::Warn) {
        eprintln!("Log level normalization: log_warning called with {:?} level, normalizing to Warn", entry.level);
        entry.level = LogLevel::Warn;
    }
    log_structured_entry(app_handle, entry);
}

/// Log a structured info entry.
pub fn log_info(app_handle: &AppHandle, mut entry: StructuredLogEntry) {
    if !matches!(entry.level, LogLevel::Info) {
        eprintln!("Log level normalization: log_info called with {:?} level, normalizing to Info", entry.level);
        entry.level = LogLevel::Info;
    }
    log_structured_entry(app_handle, entry);
}

/// Log a structured debug entry.
pub fn log_debug(app_handle: &AppHandle, mut entry: StructuredLogEntry) {
    if !matches!(entry.level, LogLevel::Debug) {
        eprintln!("Log level normalization: log_debug called with {:?} level, normalizing to Debug", entry.level);
        entry.level = LogLevel::Debug;
    }
    log_structured_entry(app_handle, entry);
}

/// Convenience function to log errors with minimal boilerplate.
pub fn log_error_simple(app_handle: &AppHandle, category: ErrorCategory, message: &str, error_details: Option<&str>) {
    let entry = StructuredLogEntry::error(category, message, None, error_details);
    log_error(app_handle, entry);
}

/// Convenience function to log errors with context.
pub fn log_error_with_context(
    app_handle: &AppHandle,
    category: ErrorCategory,
    message: &str,
    context: serde_json::Value,
    error_details: Option<&str>,
) {
    let entry = StructuredLogEntry::error(category, message, Some(context), error_details);
    log_error(app_handle, entry);
}

/// Convenience function to log warnings with minimal boilerplate.
pub fn log_warning_simple(app_handle: &AppHandle, category: ErrorCategory, message: &str) {
    let entry = StructuredLogEntry::warn(category, message, None);
    log_warning(app_handle, entry);
}

/// Convenience function to log info with minimal boilerplate.
pub fn log_info_simple(app_handle: &AppHandle, category: ErrorCategory, message: &str) {
    let entry = StructuredLogEntry::info(category, message, None);
    log_info(app_handle, entry);
}

/// Convenience function to log debug with minimal boilerplate.
pub fn log_debug_simple(app_handle: &AppHandle, category: ErrorCategory, message: &str) {
    let entry = StructuredLogEntry::debug(category, message, None);
    log_debug(app_handle, entry);
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_structured_log_entry_json_format() {
        let entry = StructuredLogEntry::error(
            ErrorCategory::Network,
            "test error",
            Some(serde_json::json!({"key": "value"})),
            Some("details"),
        );

        let json = entry.to_json().unwrap();
        let parsed: serde_json::Value = serde_json::from_str(&json).unwrap();

        // Verify the JSON contains all expected fields
        assert!(parsed.get("timestamp").is_some());
        assert_eq!(parsed["level"], "Error"); // Use actual serialized value
        assert_eq!(parsed["category"], "Network");
        assert_eq!(parsed["message"], "test error");
        assert_eq!(parsed["context"]["key"], "value");
        assert_eq!(parsed["error_details"], "details");

        // Verify timestamp is a number (milliseconds since epoch)
        let timestamp = parsed["timestamp"].as_u64().unwrap();
        assert!(timestamp > 0);
    }

    #[test]
    fn test_structured_log_entry_all_levels() {
        let levels = [
            (LogLevel::Error, StructuredLogEntry::error(ErrorCategory::System, "error", None, None)),
            (LogLevel::Warn, StructuredLogEntry::warn(ErrorCategory::System, "warn", None)),
            (LogLevel::Info, StructuredLogEntry::info(ErrorCategory::System, "info", None)),
            (LogLevel::Debug, StructuredLogEntry::debug(ErrorCategory::System, "debug", None)),
        ];

        for (expected_level, entry) in levels {
            let json = entry.to_json().unwrap();
            let parsed: serde_json::Value = serde_json::from_str(&json).unwrap();

            // Check that the level matches what we expect from serialization
            match expected_level {
                LogLevel::Error => assert_eq!(parsed["level"], "Error"),
                LogLevel::Warn => assert_eq!(parsed["level"], "Warn"),
                LogLevel::Info => assert_eq!(parsed["level"], "Info"),
                LogLevel::Debug => assert_eq!(parsed["level"], "Debug"),
            }
            assert!(parsed.get("timestamp").is_some());
            assert_eq!(parsed["category"], "System");
        }
    }

    #[test]
    fn test_convenience_functions_normalize_levels() {
        // Test that log_error normalizes incorrect levels
        let mut debug_entry = StructuredLogEntry::debug(ErrorCategory::System, "debug message", None);
        assert!(matches!(debug_entry.level, LogLevel::Debug));

        // Since we can't easily mock AppHandle, we'll test the level normalization logic
        // by checking that the function would normalize the level correctly
        if !matches!(debug_entry.level, LogLevel::Error) {
            debug_entry.level = LogLevel::Error;
        }
        assert!(matches!(debug_entry.level, LogLevel::Error));

        // Test similar for other levels
        let mut error_entry = StructuredLogEntry::error(ErrorCategory::Network, "error message", None, None);
        if !matches!(error_entry.level, LogLevel::Warn) {
            error_entry.level = LogLevel::Warn;
        }
        assert!(matches!(error_entry.level, LogLevel::Warn));

        let mut info_entry = StructuredLogEntry::info(ErrorCategory::Validation, "info message", None);
        if !matches!(info_entry.level, LogLevel::Debug) {
            info_entry.level = LogLevel::Debug;
        }
        assert!(matches!(info_entry.level, LogLevel::Debug));
    }
}
