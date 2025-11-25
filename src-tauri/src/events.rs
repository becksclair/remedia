//! Centralized event names shared across the backend.
//! Keep these in sync with `src/types/events.ts`.

pub const EVT_UPDATE_MEDIA_INFO: &str = "update-media-info";
pub const EVT_DOWNLOAD_PROGRESS: &str = "download-progress";
pub const EVT_DOWNLOAD_COMPLETE: &str = "download-complete";
pub const EVT_DOWNLOAD_ERROR: &str = "download-error";
pub const EVT_DOWNLOAD_CANCELLED: &str = "download-cancelled";
pub const EVT_DOWNLOAD_STARTED: &str = "download-started";
pub const EVT_DOWNLOAD_QUEUED: &str = "download-queued";
pub const EVT_YTDLP_STDERR: &str = "yt-dlp-stderr";
pub const EVT_REMOTE_ADD_URL: &str = "remote-add-url";
pub const EVT_REMOTE_START: &str = "remote-start-downloads";
pub const EVT_REMOTE_CANCEL: &str = "remote-cancel-downloads";
