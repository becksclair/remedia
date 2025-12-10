//! Typed error types for the downloader module.
//!
//! These errors provide structured information about failures while
//! maintaining compatibility with Tauri's `Result<T, String>` command interface.

use serde::Serialize;
use thiserror::Error;

/// Categories of validation errors.
#[derive(Debug, Clone, Serialize)]
pub enum ValidationKind {
    InvalidUrl,
    InvalidSettings,
    InvalidPath,
    InvalidMediaIdx,
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

    #[error("queue error: {message}")]
    Queue {
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
    pub fn queue(message: impl Into<String>) -> Self {
        Self::Queue {
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
}
