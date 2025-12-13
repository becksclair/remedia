//! Typed error types for the downloader module.
//!
//! These errors provide structured information about failures while
//! maintaining compatibility with Tauri's `Result<T, String>` command interface.
//!
//! Error codes are designed for frontend programmatic handling:
//! - `E_VAL_*`: Validation errors (user can fix input)
//! - `E_IO_*`: File system errors
//! - `E_DL_*`: Download errors (may be retryable)
//! - `E_NET_*`: Network errors (often retryable)
//! - `E_Q_*`: Queue errors
//! - `E_INT_*`: Internal errors (should be reported)

use serde::Serialize;
use thiserror::Error;

/// Error codes for frontend programmatic handling.
/// These provide stable identifiers that don't change with message text.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum ErrorCode {
    // Validation errors (E_VAL_*)
    EValInvalidUrl,
    EValInvalidSettings,
    EValInvalidPath,
    EValInvalidMediaIdx,

    // IO errors (E_IO_*)
    EIoReadFailed,
    EIoWriteFailed,
    EIoNotFound,
    EIoPermissionDenied,

    // Download errors (E_DL_*)
    EDlSpawnFailed,
    EDlProcessFailed,
    EDlCancelled,
    EDlTimeout,
    EDlOutputUnavailable,

    // Network errors (E_NET_*)
    ENetConnectionFailed,
    ENetTimeout,
    ENetRateLimited,

    // Queue errors (E_Q_*)
    EQueueFull,
    EQueueDuplicate,
    EQueueNotFound,

    // Internal errors (E_INT_*)
    EInternal,
    EIntSerializeFailed,
    EIntLockPoisoned,
}

impl ErrorCode {
    /// Returns whether this error is typically retryable.
    pub const fn is_retryable(&self) -> bool {
        matches!(
            self,
            Self::ENetConnectionFailed
                | Self::ENetTimeout
                | Self::ENetRateLimited
                | Self::EDlTimeout
                | Self::EDlProcessFailed
        )
    }

    /// Returns the error code as a string (e.g., "E_VAL_INVALID_URL").
    pub const fn as_str(&self) -> &'static str {
        match self {
            Self::EValInvalidUrl => "E_VAL_INVALID_URL",
            Self::EValInvalidSettings => "E_VAL_INVALID_SETTINGS",
            Self::EValInvalidPath => "E_VAL_INVALID_PATH",
            Self::EValInvalidMediaIdx => "E_VAL_INVALID_MEDIA_IDX",
            Self::EIoReadFailed => "E_IO_READ_FAILED",
            Self::EIoWriteFailed => "E_IO_WRITE_FAILED",
            Self::EIoNotFound => "E_IO_NOT_FOUND",
            Self::EIoPermissionDenied => "E_IO_PERMISSION_DENIED",
            Self::EDlSpawnFailed => "E_DL_SPAWN_FAILED",
            Self::EDlProcessFailed => "E_DL_PROCESS_FAILED",
            Self::EDlCancelled => "E_DL_CANCELLED",
            Self::EDlTimeout => "E_DL_TIMEOUT",
            Self::EDlOutputUnavailable => "E_DL_OUTPUT_UNAVAILABLE",
            Self::ENetConnectionFailed => "E_NET_CONNECTION_FAILED",
            Self::ENetTimeout => "E_NET_TIMEOUT",
            Self::ENetRateLimited => "E_NET_RATE_LIMITED",
            Self::EQueueFull => "E_Q_FULL",
            Self::EQueueDuplicate => "E_Q_DUPLICATE",
            Self::EQueueNotFound => "E_Q_NOT_FOUND",
            Self::EInternal => "E_INTERNAL",
            Self::EIntSerializeFailed => "E_INT_SERIALIZE_FAILED",
            Self::EIntLockPoisoned => "E_INT_LOCK_POISONED",
        }
    }
}

/// Categories of validation errors.
#[derive(Debug, Clone, Serialize)]
pub enum ValidationKind {
    InvalidUrl,
    InvalidSettings,
    InvalidPath,
    InvalidMediaIdx,
}

/// Kinds of queue errors. Use this to classify queue failures
/// in a stable, machine-readable way instead of probing message text.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
pub enum QueueErrorKind {
    Duplicate,
    Full,
    NotFound,
}

/// Unified error type for the downloader subsystem.
#[derive(Debug, Error)]
pub enum DownloaderError {
    #[error("validation error ({kind:?}): {message}")]
    Validation {
        kind: ValidationKind,
        message: String,
    },

    #[error("io error in {context}: {source}")]
    Io {
        context: String,
        #[source]
        source: std::io::Error,
    },

    #[error("download failed for media {media_idx}: {reason}")]
    Download {
        media_idx: i32,
        reason: String,
    },

    #[error("queue error ({kind:?}): {message}")]
    Queue {
        kind: QueueErrorKind,
        message: String,
    },

    #[error("network error for {url}: {message}")]
    Network {
        url: String,
        message: String,
    },

    #[error("internal error: {message}")]
    Internal {
        message: String,
    },
}

/// Structured error for frontend consumption.
/// Contains both human-readable message and machine-readable code.
#[derive(Debug, Clone, Serialize)]
pub struct FrontendError {
    /// Machine-readable error code (e.g., "E_VAL_INVALID_URL")
    pub code: &'static str,
    /// Human-readable error message
    pub message: String,
    /// Whether the operation can be retried
    pub retryable: bool,
}

impl DownloaderError {
    /// Convert to a structured frontend error.
    pub fn to_frontend_error(&self) -> FrontendError {
        let (code, retryable) = match self {
            Self::Validation { kind, .. } => {
                let code = match kind {
                    ValidationKind::InvalidUrl => ErrorCode::EValInvalidUrl,
                    ValidationKind::InvalidSettings => ErrorCode::EValInvalidSettings,
                    ValidationKind::InvalidPath => ErrorCode::EValInvalidPath,
                    ValidationKind::InvalidMediaIdx => ErrorCode::EValInvalidMediaIdx,
                };
                (code, false)
            }
            Self::Io { source, .. } => {
                let code = match source.kind() {
                    std::io::ErrorKind::NotFound => ErrorCode::EIoNotFound,
                    std::io::ErrorKind::PermissionDenied => ErrorCode::EIoPermissionDenied,
                    _ => ErrorCode::EIoWriteFailed,
                };
                (code, false)
            }
            Self::Download { .. } => (ErrorCode::EDlProcessFailed, true),
            Self::Queue { kind, .. } => {
                let code = match kind {
                    QueueErrorKind::Duplicate => ErrorCode::EQueueDuplicate,
                    QueueErrorKind::Full => ErrorCode::EQueueFull,
                    QueueErrorKind::NotFound => ErrorCode::EQueueNotFound,
                };
                (code, false)
            }
            Self::Network { .. } => (ErrorCode::ENetConnectionFailed, true),
            Self::Internal { .. } => (ErrorCode::EInternal, false),
        };

        FrontendError {
            code: code.as_str(),
            message: self.to_string(),
            retryable,
        }
    }

    /// Convert to JSON string for frontend consumption.
    pub fn to_frontend_json(&self) -> String {
        serde_json::to_string(&self.to_frontend_error()).unwrap_or_else(|_| self.to_string())
    }
}

// For Tauri command compatibility - auto-converts to String
impl From<DownloaderError> for String {
    fn from(err: DownloaderError) -> String {
        err.to_string()
    }
}

impl From<&DownloaderError> for String {
    fn from(err: &DownloaderError) -> String {
        err.to_string()
    }
}

// Convenience constructors
impl DownloaderError {
    /// Create a URL validation error.
    pub fn invalid_url(message: impl Into<String>) -> Self {
        Self::Validation {
            kind: ValidationKind::InvalidUrl,
            message: message.into(),
        }
    }

    /// Create a settings validation error.
    pub fn invalid_settings(message: impl Into<String>) -> Self {
        Self::Validation {
            kind: ValidationKind::InvalidSettings,
            message: message.into(),
        }
    }

    /// Create a path validation error.
    pub fn invalid_path(message: impl Into<String>) -> Self {
        Self::Validation {
            kind: ValidationKind::InvalidPath,
            message: message.into(),
        }
    }

    /// Create a media index validation error.
    pub fn invalid_media_idx(message: impl Into<String>) -> Self {
        Self::Validation {
            kind: ValidationKind::InvalidMediaIdx,
            message: message.into(),
        }
    }

    /// Create an IO error with context.
    pub fn io(context: impl Into<String>, source: std::io::Error) -> Self {
        Self::Io {
            context: context.into(),
            source,
        }
    }

    /// Create a download error.
    pub fn download(media_idx: i32, reason: impl Into<String>) -> Self {
        Self::Download {
            media_idx,
            reason: reason.into(),
        }
    }

    /// Create a queue error.
    /// Create a generic queue error (defaults to `NotFound`).
    pub fn queue(message: impl Into<String>) -> Self {
        Self::Queue {
            kind: QueueErrorKind::NotFound,
            message: message.into(),
        }
    }

    /// Create a queue duplicate error.
    pub fn queue_duplicate(message: impl Into<String>) -> Self {
        Self::Queue {
            kind: QueueErrorKind::Duplicate,
            message: message.into(),
        }
    }

    /// Create a queue full error.
    pub fn queue_full(message: impl Into<String>) -> Self {
        Self::Queue {
            kind: QueueErrorKind::Full,
            message: message.into(),
        }
    }

    /// Create a queue not found error.
    pub fn queue_not_found(message: impl Into<String>) -> Self {
        Self::Queue {
            kind: QueueErrorKind::NotFound,
            message: message.into(),
        }
    }

    /// Create a network error.
    pub fn network(url: impl Into<String>, message: impl Into<String>) -> Self {
        Self::Network {
            url: url.into(),
            message: message.into(),
        }
    }

    /// Create an internal error.
    pub fn internal(message: impl Into<String>) -> Self {
        Self::Internal {
            message: message.into(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_error_display() {
        let err = DownloaderError::invalid_url("URL cannot be empty");
        assert_eq!(err.to_string(), "validation error (InvalidUrl): URL cannot be empty");

        let err = DownloaderError::download(42, "connection timed out");
        assert_eq!(err.to_string(), "download failed for media 42: connection timed out");
    }

    #[test]
    fn test_error_to_string_conversion() {
        let err = DownloaderError::invalid_settings("unknown format");
        let s: String = err.into();
        assert!(s.contains("validation error"));
        assert!(s.contains("unknown format"));
    }

    #[test]
    fn test_io_error_wrapping() {
        let io_err = std::io::Error::new(std::io::ErrorKind::NotFound, "file not found");
        let err = DownloaderError::io("reading config", io_err);
        let s = err.to_string();
        assert!(s.contains("io error in reading config"));
    }

    #[test]
    fn test_error_code_as_str() {
        assert_eq!(ErrorCode::EValInvalidUrl.as_str(), "E_VAL_INVALID_URL");
        assert_eq!(ErrorCode::ENetConnectionFailed.as_str(), "E_NET_CONNECTION_FAILED");
        assert_eq!(ErrorCode::EDlProcessFailed.as_str(), "E_DL_PROCESS_FAILED");
    }

    #[test]
    fn test_error_code_retryable() {
        assert!(ErrorCode::ENetConnectionFailed.is_retryable());
        assert!(ErrorCode::ENetTimeout.is_retryable());
        assert!(ErrorCode::EDlProcessFailed.is_retryable());
        assert!(!ErrorCode::EValInvalidUrl.is_retryable());
        assert!(!ErrorCode::EInternal.is_retryable());
    }

    #[test]
    fn test_frontend_error_from_validation() {
        let err = DownloaderError::invalid_url("bad URL");
        let fe = err.to_frontend_error();
        assert_eq!(fe.code, "E_VAL_INVALID_URL");
        assert!(!fe.retryable);
        assert!(fe.message.contains("bad URL"));
    }

    #[test]
    fn test_frontend_error_from_network() {
        let err = DownloaderError::network("https://example.com", "connection refused");
        let fe = err.to_frontend_error();
        assert_eq!(fe.code, "E_NET_CONNECTION_FAILED");
        assert!(fe.retryable);
    }

    #[test]
    fn test_frontend_error_from_io_not_found() {
        let io_err = std::io::Error::new(std::io::ErrorKind::NotFound, "file not found");
        let err = DownloaderError::io("reading file", io_err);
        let fe = err.to_frontend_error();
        assert_eq!(fe.code, "E_IO_NOT_FOUND");
        assert!(!fe.retryable);
    }

    #[test]
    fn test_frontend_error_json_serialization() {
        let err = DownloaderError::invalid_url("empty URL");
        let json = err.to_frontend_json();
        assert!(json.contains("E_VAL_INVALID_URL"));
        assert!(json.contains("retryable"));
        assert!(json.contains("false"));
    }

    #[test]
    fn test_queue_error_duplicate_detection() {
        let err = DownloaderError::queue_duplicate("duplicate entry in queue");
        let fe = err.to_frontend_error();
        assert_eq!(fe.code, "E_Q_DUPLICATE");
    }

    #[test]
    fn test_queue_error_full_detection() {
        let err = DownloaderError::queue_full("queue is full");
        let fe = err.to_frontend_error();
        assert_eq!(fe.code, "E_Q_FULL");
    }

    #[test]
    fn test_queue_error_not_found_detection() {
        let err = DownloaderError::queue_not_found("item not found in queue");
        let fe = err.to_frontend_error();
        assert_eq!(fe.code, "E_Q_NOT_FOUND");
    }

    #[test]
    fn test_all_error_codes_unique() {
        use std::collections::HashSet;
        let codes = [
            ErrorCode::EValInvalidUrl,
            ErrorCode::EValInvalidSettings,
            ErrorCode::EValInvalidPath,
            ErrorCode::EValInvalidMediaIdx,
            ErrorCode::EIoReadFailed,
            ErrorCode::EIoWriteFailed,
            ErrorCode::EIoNotFound,
            ErrorCode::EIoPermissionDenied,
            ErrorCode::EDlSpawnFailed,
            ErrorCode::EDlProcessFailed,
            ErrorCode::EDlCancelled,
            ErrorCode::EDlTimeout,
            ErrorCode::EDlOutputUnavailable,
            ErrorCode::ENetConnectionFailed,
            ErrorCode::ENetTimeout,
            ErrorCode::ENetRateLimited,
            ErrorCode::EQueueFull,
            ErrorCode::EQueueDuplicate,
            ErrorCode::EQueueNotFound,
            ErrorCode::EInternal,
            ErrorCode::EIntSerializeFailed,
            ErrorCode::EIntLockPoisoned,
        ];
        let strings: HashSet<_> = codes.iter().map(|c| c.as_str()).collect();
        assert_eq!(
            strings.len(),
            codes.len(),
            "All error codes must have unique string representations"
        );
    }

    #[test]
    fn test_download_error_frontend_conversion() {
        let err = DownloaderError::download(123, "spawn failed");
        let fe = err.to_frontend_error();
        assert_eq!(fe.code, "E_DL_PROCESS_FAILED");
        assert!(fe.retryable);
        assert!(fe.message.contains("123"));
    }
}
