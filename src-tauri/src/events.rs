//! Centralized event names shared across the backend.
//! Keep these in sync with `src/types/events.ts`.

pub const EVT_UPDATE_MEDIA_INFO: &str = "update-media-info";
pub const EVT_DOWNLOAD_PROGRESS: &str = "download-progress";
pub const EVT_DOWNLOAD_COMPLETE: &str = "download-complete";
pub const EVT_DOWNLOAD_ERROR: &str = "download-error";
pub const EVT_DOWNLOAD_ERROR_DETAIL: &str = "download-error-detail";
pub const EVT_DOWNLOAD_INVOKE_ACK: &str = "download-invoke-ack";
pub const EVT_DOWNLOAD_CANCELLED: &str = "download-cancelled";
pub const EVT_DOWNLOAD_STARTED: &str = "download-started";
pub const EVT_DOWNLOAD_QUEUED: &str = "download-queued";
pub const EVT_YTDLP_STDERR: &str = "yt-dlp-stderr";
pub const EVT_REMOTE_ADD_URL: &str = "remote-add-url";
pub const EVT_REMOTE_START: &str = "remote-start-downloads";
pub const EVT_REMOTE_CANCEL: &str = "remote-cancel-downloads";
pub const EVT_REMOTE_CLEAR_LIST: &str = "remote-clear-list";
pub const EVT_REMOTE_SET_DOWNLOAD_DIR: &str = "remote-set-download-dir";

// Remote debugging events
pub const EVT_DOWNLOAD_EXEC: &str = "download-exec";
pub const EVT_DOWNLOAD_RAW: &str = "download-raw";
pub const EVT_DOWNLOAD_INVOKE: &str = "download-invoke";
pub const EVT_REMOTE_RECV: &str = "remote-recv";
pub const EVT_DEBUG_ECHO: &str = "debug-echo";
pub const EVT_DEBUG_SNAPSHOT: &str = "debug-snapshot";
