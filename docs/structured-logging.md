# Structured Logging System

This document describes the structured logging implementation for ReMedia, providing consistent error handling and log formatting across both Rust backend and TypeScript frontend.

## Overview

The structured logging system provides:
- **Consistent log format** across all components
- **Error categorization** for better filtering and analysis
- **Log level filtering** to control verbosity
- **JSON serialization** for machine-readable logs
- **File rotation** to prevent unbounded log growth

## Rust Backend

### Log Levels

```rust
pub enum LogLevel {
    Error,  // 0 - Always logged
    Warn,   // 1 - Default minimum level
    Info,   // 2 - Verbose information
    Debug,  // 3 - Debug details
}
```

### Error Categories

```rust
pub enum ErrorCategory {
    Network,    // Network-related errors
    Validation, // Input validation errors
    System,     // System-level errors
    Download,   // Download-related errors
    Unknown,    // Unclassified errors
}
```

### Usage Examples

#### Simple Error Logging

```rust
use crate::logging::{log_error_simple, ErrorCategory};

log_error_simple(&app_handle, ErrorCategory::Download, 
                 "Download failed", Some(&error.to_string()));
```

#### Error with Context

```rust
use crate::logging::{log_error_with_context, ErrorCategory};
use serde_json::json;

log_error_with_context(&app_handle, ErrorCategory::Validation,
                       "Invalid settings", 
                       json!({
                           "media_idx": media_idx,
                           "settings": settings_str
                       }), Some(&e.to_string()));
```

#### Warning Logging

```rust
use crate::logging::{log_warning_simple, ErrorCategory};

log_warning_simple(&app_handle, ErrorCategory::Network, 
                  "API did not return thumbnail");
```

### Log Level Control

Set the log level via environment variable:
```bash
export REMEDIA_LOG_LEVEL=debug  # Show all logs
export REMEDIA_LOG_LEVEL=info   # Default level
export REMEDIA_LOG_LEVEL=error  # Only errors
```

### Log Files

- **Error logs**: `logs/remedia-errors.log` (JSON format)
- **yt-dlp logs**: `logs/remedia-yt-dlp.log` (plain text)

## Frontend TypeScript

### Log Structure

```typescript
interface StructuredLogEntry {
  timestamp: number;
  level: ErrorSeverity;
  category: ErrorCategory;
  message: string;
  context?: Record<string, any>;
  error_details?: string;
}
```

### Usage Examples

#### Structured Logger

```typescript
import { StructuredLogger, ErrorCategory } from '@/shared/error-handler';

StructuredLogger.error(ErrorCategory.Download, 'Download failed', 
                      { url: 'https://example.com' }, error.stack);

StructuredLogger.warn(ErrorCategory.Network, 'API rate limit exceeded');
StructuredLogger.info(ErrorCategory.System, 'Application started');
```

#### Error Handler Integration

```typescript
import { handleError } from '@/shared/error-handler';

try {
  await downloadMedia(url);
} catch (error) {
  handleError(error, { url, retryCount: 3 }, retryAction);
}
```

### Console Output

All structured logs are written to console in JSON format:
```json
{
  "timestamp": 1701234567890,
  "level": "ERROR",
  "category": "download",
  "message": "Download failed",
  "context": { "url": "https://example.com" },
  "error_details": "Network timeout"
}
```

## Log Analysis

### Filtering by Category

```bash
# Extract download errors
grep '"category":"download"' logs/remedia-errors.log

# Extract network warnings
grep '"category":"network"' logs/remedia-errors.log | grep '"level":"WARN"'
```

### Time-based Analysis

```bash
# Extract logs from specific time range (24-hour window example)
jq 'select(.timestamp >= 1701234567890 and .timestamp <= 1701320967890)' logs/remedia-errors.log
```

### Error Frequency

```bash
# Count errors by category
jq -r '.category' logs/remedia-errors.log | sort | uniq -c
```

## Migration Guide

### Replacing eprintln! calls

**Before:**
```rust
eprintln!("Download error for media_idx {}: {}", media_idx, reason);
```

**After:**
```rust
log_error_simple(&app_handle, ErrorCategory::Download, 
                 &format!("Download error for media_idx {}", media_idx), 
                 Some(reason));
```

### Replacing console.error calls

**Before:**
```typescript
console.error("App Error:", { message, category, originalError });
```

**After:**
```typescript
StructuredLogger.error(category, message, context, errorDetails);
```

## Best Practices

1. **Use appropriate categories** - Choose the most specific category for your error
2. **Include context** - Add relevant context information for better debugging
3. **Set proper log levels** - Use environment variables to control verbosity
4. **Monitor log files** - Regularly check log files for patterns and issues
5. **Don't log sensitive data** - Avoid logging passwords, tokens, or PII

## Troubleshooting

### Logs Not Appearing

- Check `REMEDIA_LOG_LEVEL` environment variable
- Verify file permissions in logs directory
- Ensure log rotation isn't removing entries too quickly

### Performance Impact

- Structured logging has minimal overhead
- Log level filtering prevents unnecessary processing
- File operations are asynchronous and non-blocking

### Log File Size

- Automatic rotation at 1MB limit
- Only one backup file maintained
- Consider external log aggregation for production
