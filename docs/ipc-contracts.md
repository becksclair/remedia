# ReMedia IPC Contracts

This document defines the communication contracts between the React frontend and Rust backend via Tauri's inter-process communication (IPC) system.

## Overview

ReMedia uses an event-driven IPC architecture:
- **Commands**: Frontend invokes backend functions via `invoke()`
- **Events**: Backend emits data to frontend via `emit()`
- **Event Handling**: Frontend listens via `useTauriEvents()` hook

## Type Definitions

All shared types are defined in `src/types/index.ts`:

```typescript
// Event payload types
export type MediaProgressEvent = [number, number];        // [mediaIdx, progress]
export type MediaInfoEvent = [number, string, string, string]; // [mediaIdx, url, title, thumbnail]

// Command payload types
export interface DownloadMediaCommand {
  mediaIdx: number;
  mediaSourceUrl: string;
  outputLocation: string;
}

export interface GetMediaInfoCommand {
  mediaIdx: number;
  mediaSourceUrl: string;
}

export type QuitCommand = undefined;
```

## Commands (Frontend → Backend)

### 1. get_media_info

Extracts metadata from a media URL using yt-dlp.

**Signature:**
```typescript
invoke("get_media_info", {
  mediaIdx: number,
  mediaSourceUrl: string
}): Promise<void>
```

**Parameters:**
- `mediaIdx`: Unique identifier for the media item in the frontend queue
- `mediaSourceUrl`: URL to extract metadata from

**Behavior:**
- Spawns yt-dlp process with `-j` (JSON output) flag
- Extracts title and thumbnail from response
- Emits `update-media-info` event for each valid media item found
- Handles playlists by emitting multiple events

**Error Handling:**
- Returns `Err(String)` if no valid media info is found
- Logs parsing errors to console but continues processing other items

---

### 2. download_media

Initiates download of a media file using yt-dlp.

**Signature:**
```typescript
invoke("download_media", {
  mediaIdx: number,
  mediaSourceUrl: string,
  outputLocation: string
}): Promise<void>
```

**Parameters:**
- `mediaIdx`: Unique identifier for tracking progress
- `mediaSourceUrl`: URL to download from
- `outputLocation`: Directory path where files should be saved

**Behavior:**
- Spawns async yt-dlp process with comprehensive options:
  - `--progress-template`: Custom progress format for parsing
  - `--continue`: Resume incomplete downloads
  - `--embed-thumbnail`: Embed thumbnail in file
  - `--embed-subs`: Embed subtitles
  - `--embed-metadata`: Embed metadata
  - `--embed-chapters`: Embed chapter information
  - `--windows-filenames`: Safe filename handling on Windows
- Parses stdout for progress information in real-time
- Forwards stderr via `yt-dlp-stderr` events

**Error Handling:**
- Process errors are emitted via `download-error` event
- Stderr output is forwarded to frontend for debugging

---

### 3. set_always_on_top

Controls window "always on top" behavior.

**Signature:**
```typescript
invoke("set_always_on_top", {
  alwaysOnTop: boolean
}): Promise<void>
```

**Parameters:**
- `alwaysOnTop`: Whether the main window should stay on top

**Behavior:**
- Updates the main window's always-on-top property
- Persists across application restarts via settings

---

### 4. is_wayland

Detects if running on Wayland display server (Linux).

**Signature:**
```typescript
invoke("is_wayland"): Promise<boolean>
```

**Returns:**
- `true` if running on Wayland, `false` otherwise

**Usage:**
- Used to adjust UI behavior for Wayland compatibility
- Some features may be limited on Wayland for security reasons

---

### 5. open_preview_window

Opens a separate preview window for media playback.

**Signature:**
```typescript
invoke("open_preview_window", {
  url: string
}): Promise<void>
```

**Parameters:**
- `url`: Media URL to open in preview window

**Behavior:**
- Creates new Tauri window with player component
- Loads media URL in embedded player
- Window is independent and can be closed separately

---

### 6. quit

Gracefully shuts down the application.

**Signature:**
```typescript
invoke("quit"): Promise<void>
```

**Behavior:**
- Initiates application shutdown
- Cleans up resources and processes
- Exits with appropriate status code

## Events (Backend → Frontend)

### 1. update-media-info

Emitted when media metadata is extracted.

**Event Name:** `"update-media-info"`

**Payload:** `MediaInfoEvent` - `[mediaIdx, mediaSourceUrl, title, thumbnail]`

**Fields:**
- `mediaIdx`: Index identifier from the original command
- `mediaSourceUrl`: Original URL used for extraction
- `title`: Extracted media title (fallbacks to URL if not found)
- `thumbnail`: Thumbnail URL or empty string if not available

**Usage:**
- Updates media list with extracted information
- Triggers UI refresh to show titles and thumbnails

---

### 2. download-progress

Emitted during active download with progress updates.

**Event Name:** `"download-progress"`

**Payload:** `MediaProgressEvent` - `[mediaIdx, progress]`

**Fields:**
- `mediaIdx`: Index identifier for tracking
- `progress`: Download progress percentage (0.0 - 100.0)

**Calculation:**
```rust
progress = (downloaded_bytes / total_bytes) * 100.0
```

**Frequency:**
- Emitted as yt-dlp outputs progress lines
- Throttled by yt-dlp's natural output frequency
- Typically multiple updates per second for active downloads

---

### 3. download-complete

Emitted when a download finishes successfully.

**Event Name:** `"download-complete"`

**Payload:** `number` - `mediaIdx`

**Behavior:**
- Indicates successful download completion
- Triggers UI state update to mark item as completed
- May trigger notification system

---

### 4. download-error

Emitted when a download fails or encounters an error.

**Event Name:** `"download-error"`

**Payload:** `number` - `mediaIdx`

**Behavior:**
- Indicates download failure
- Triggers error state in UI
- Additional error details available via `yt-dlp-stderr` events

---

### 5. yt-dlp-stderr

Emits stderr output from yt-dlp process for debugging.

**Event Name:** `"yt-dlp-stderr"`

**Payload:** `[number, string]` - `[mediaIdx, errorLine]`

**Fields:**
- `mediaIdx`: Index identifier for context
- `errorLine`: Single line of stderr output

**Usage:**
- Debugging download issues
- Displaying detailed error information
- Logging for troubleshooting

## Event Handling Pattern

Frontend event handling is centralized through the `useTauriEvents` hook:

```typescript
import { useTauriEvents } from "@/hooks/useTauriEvent";

useTauriEvents({
  "update-media-info": handleMediaInfo,
  "download-progress": handleProgress,
  "download-complete": handleComplete,
  "download-error": handleError,
  "yt-dlp-stderr": handleStderr
});
```

### Event Registration Flow

1. **Component Mount**: `useTauriEvents` registers listeners
2. **Event Arrival**: Tauri delivers event to registered handler
3. **State Update**: Handler updates Jotai atoms or local state
4. **UI Refresh**: React re-renders with new state
5. **Cleanup**: Listeners are removed on component unmount

### Test Event Injection

For E2E testing, events can be injected via:

```typescript
// Available globally during tests
window.__E2E_emitTauriEvent("download-progress", [1, 75.5]);
```

## Error Handling Strategy

### Backend Error Handling

1. **Command Validation**: Input parameters validated before processing
2. **Process Isolation**: yt-dlp runs in separate process to avoid crashes
3. **Graceful Degradation**: Errors don't crash the main application
4. **Error Forwarding**: All errors forwarded to frontend via events

### Frontend Error Handling

1. **Event Listeners**: All events have corresponding error handlers
2. **User Feedback**: Errors displayed via toast notifications
3. **State Recovery**: Error states can be cleared and retried
4. **Logging**: Detailed errors logged for debugging

## Security Considerations

### Input Sanitization

- **URL Validation**: Media URLs validated before yt-dlp invocation
- **Path Sanitization**: Output locations sanitized and validated
- **Command Escaping**: All parameters properly escaped to prevent injection

### Capability System

- **File System**: Limited to user-selected directories
- **Network**: Access only through yt-dlp process
- **Clipboard**: Explicit permission required for clipboard access

## Performance Considerations

### Event Throttling

- **Progress Events**: Natural throttling via yt-dlp output frequency
- **UI Updates**: React's natural batching prevents excessive re-renders
- **Memory Management**: Event payload structures kept minimal

### Async Processing

- **Non-blocking Commands**: All long-running operations are async
- **Process Management**: Proper cleanup of yt-dlp processes
- **Resource Limits**: No concurrent process limits currently enforced

## Future Extensions

### Planned Events

- `download-paused`: For pause/resume functionality
- `download-cancelled`: For user-initiated cancellation
- `queue-updated`: For batch queue operations

### Planned Commands

- `pause_download`: Pause active download
- `resume_download`: Resume paused download
- `cancel_download`: Cancel queued or active download
- `get_download_history`: Retrieve past download information

This contract system provides a robust, type-safe foundation for frontend-backend communication while maintaining flexibility for future enhancements.
