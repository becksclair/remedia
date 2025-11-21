/**
 * Application-wide constants
 */

// Logging
export const MAX_LOG_ENTRIES = 1000; // Prevent memory issues in long sessions
export const LOG_CLEANUP_THRESHOLD = 100; // Remove oldest entries when exceeded

// Download Management
export const CANCELLATION_POLL_INTERVAL_MS = 100; // Balance between responsiveness and CPU usage

// Window Dimensions
export const DEBUG_CONSOLE_WIDTH = 900;
export const DEBUG_CONSOLE_HEIGHT = 600;
export const PREVIEW_WINDOW_WIDTH = 760; // Default width for media preview windows
export const PREVIEW_WINDOW_HEIGHT = 560; // Default height for media preview windows

// Validation Limits
export const MAX_URL_LENGTH = 4096; // Reasonable limit for URL length
export const MAX_OUTPUT_PATH_LENGTH = 1024; // OS path length limits

// UI Timing
export const DRAG_HOVER_DEBOUNCE_MS = 300; // Debounce time for drag hover state
