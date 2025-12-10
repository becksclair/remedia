# ReMedia Specification

A cross-platform desktop media downloader built with Tauri, React, and yt-dlp.

---

## Table of Contents

1. [Overview](#1-overview)
2. [Features](#2-features)
3. [Architecture](#3-architecture)
4. [API Reference](#4-api-reference)
5. [Quality Standards](#5-quality-standards)
6. [Development Reference](#6-development-reference)

---

## 1. Overview

### 1.1 Project Description

ReMedia is a cross-platform desktop media downloader that provides a clean, modern interface for downloading media from YouTube, Vimeo, and 1000+ other supported platforms via yt-dlp.

### 1.2 Target Users

**"Download everything" power users** who want:
- A super-simple default flow: paste/drag URL → download best quality video or audio-only
- Advanced controls in Settings for quality, resolution, formats, and power features

### 1.3 Primary Goals (Priority Order)

1. **UX & Workflows** - Simple default path, intuitive interface
2. **Features** - Power-user oriented capabilities
3. **Reliability** - Robust error handling, graceful degradation
4. **Performance** - Responsive UI, controlled concurrency

### 1.4 Platform Priority

**Windows → Linux (X11/Wayland) → macOS**

### 1.5 Guiding Principles

| Principle | Description |
|-----------|-------------|
| MVP-first | Keep the default path extremely simple; hide complexity in Settings |
| Backend correctness | Leverage yt-dlp capabilities over ad hoc parsing |
| Event-driven | All actions emit observable events for debugging |
| Cross-platform | Windows-first, but avoid platform-specific hacks |
| Testable | Each feature has clear verification criteria |

---

## 2. Features

### 2.1 Core Features

#### URL Ingestion
- **Drag & Drop**: Native HTML5 drag/drop with counter-based hover detection
- **Clipboard Detection**: Auto-detect URLs on window focus (500ms cooldown after drag-drop)
- **URL Validation**: Regex validation for `http(s)://` URLs, max 4096 characters
- **Test Helper**: `window.__E2E_addUrl()` for E2E testing

#### Metadata Extraction
- yt-dlp JSON parsing (`-j` flag) for title, thumbnail, duration, uploader
- **Thumbnail Resolution Priority Chain**:
  1. Direct `thumbnail` field
  2. Last item in `thumbnails` array
  3. `thumbnail_url` field
  4. Provider-specific fallbacks (e.g., RedGifs API)
  5. Must start with `http://` or `https://`
  6. SVG placeholder if none available
- **Preview URL Selection**:
  - Tries top-level `url` field first
  - Scans `formats` array for best format (prefers mp4 +1000 points, adds quality/filesize score)
  - Returns highest-scoring URL

#### Provider-Specific Handling

**RedGifs Integration:**
- Dedicated API module with LazyLock HTTP client
- Token management: Fetches from `/auth/temporary`, caches in Mutex
- Automatic retry on 401 (expired token)
- Thumbnail fetching from `gifs/{id}?views=yes` endpoint
- URL transformation for iframe embedding in player

**Extractor URL Construction:**
- YouTube/YoutubeTab/YoutubePlaylist → `https://youtube.com/watch?v={id}`
- RedGifs/RedGifsUser → `https://redgifs.com/watch/{id}`

#### Download Management
- **Queue Architecture**: VecDeque with HashSet for O(1) duplicate checking
- **Concurrency Control**: Default 3, configurable 1-10
- **Queue States**: `Queued`, `Downloading`, `Completed`, `Failed`, `Cancelled`
- **Progress Updates**: 100ms debouncing, clamped 0-100%
- **Cancellation**: Atomic flags checked every 100ms, graceful process kill via `start_kill()`
- **Retry Logic**: 4 retries with 400ms intervals

#### Preview Window
- Separate Tauri window (`preview-win` label)
- React Player primary, iframe fallback for unsupported platforms
- Audio-only detection with custom UI
- Loading spinner and error state with retry button
- Configurable dimensions (default 800x600, min 320x200)
- DevTools auto-open in debug builds

### 2.2 Download Settings

All settings persisted via Jotai `atomWithStorage` to localStorage.

| Setting | Atom Name | Type | Default |
|---------|-----------|------|---------|
| Download Mode | `downloadModeAtom` | `"video"` \| `"audio"` | `"video"` |
| Video Quality | `videoQualityAtom` | `"best"` \| `"high"` \| `"medium"` \| `"low"` | `"best"` |
| Max Resolution | `maxResolutionAtom` | `"2160p"` \| `"1440p"` \| `"1080p"` \| `"720p"` \| `"480p"` \| `"no-limit"` | `"no-limit"` |
| Video Format | `videoFormatAtom` | `"mp4"` \| `"mkv"` \| `"webm"` \| `"best"` | `"best"` |
| Audio Format | `audioFormatAtom` | `"mp3"` \| `"m4a"` \| `"opus"` \| `"best"` | `"best"` |
| Audio Quality | `audioQualityAtom` | `"0"` \| `"2"` \| `"5"` \| `"9"` | `"0"` |
| Max Concurrent | `maxConcurrentDownloadsAtom` | `1` - `10` | `3` |
| Rate Limit | `downloadRateLimitAtom` | `"unlimited"` \| `"50K"` \| `"100K"` \| `"500K"` \| `"1M"` \| `"5M"` \| `"10M"` | `"unlimited"` |
| Max File Size | `maxFileSizeAtom` | `"unlimited"` \| `"50M"` \| `"100M"` \| `"500M"` \| `"1G"` \| `"5G"` | `"unlimited"` |
| Unique ID | `appendUniqueIdAtom` | `boolean` | `true` |
| Unique ID Type | `uniqueIdTypeAtom` | `"native"` \| `"hash"` | `"native"` |
| Always On Top | `alwaysOnTopAtom` | `boolean` | `false` |
| Download Location | `downloadLocationAtom` | `string` | `""` |
| Theme | `themeAtom` | `"system"` \| `"light"` \| `"dark"` | `"system"` |
| Clipboard Import | `clipboardAutoImportAtom` | `boolean` | `true` |

#### Quality Mapping

**Video Quality → yt-dlp format strings:**
```
best:   bestvideo+bestaudio/best
high:   bestvideo[height<=1080]+bestaudio/best[height<=1080]
medium: bestvideo[height<=720]+bestaudio/best[height<=720]
low:    bestvideo[height<=480]+bestaudio/best[height<=480]
```

**Audio Mode:** `-f bestaudio --extract-audio --audio-format {format} --audio-quality {quality}`

**Audio Quality → yt-dlp `--audio-quality`:**
- `0` = 320 kbps (best)
- `2` = 256 kbps (high)
- `5` = 192 kbps (medium)
- `9` = 128 kbps (low)

#### Rate/Size Validation
Valid formats: `"50K"`, `"1M"`, `"1.5G"`, `"unlimited"`, pure numbers
- Requires positive number with optional K|M|G suffix (case-insensitive)

### 2.3 Settings Dialog

Three-tab modal interface:

**General Tab:**
- Theme selection (System/Light/Dark)
- Always on top toggle (with Wayland detection/warning)
- Clipboard auto-import toggle
- Download location picker (with Browse button)
- Unique ID appending toggle with type selector (Native vs Hash)
- ID type preview display
- Update checker with loading state

**Downloads Tab:**
- Download mode selector (Video/Audio-only)
- Max concurrent downloads (1-10)
- Download rate limit (8 options)
- Max file size (6 options)

**Quality Tab:**
- Video quality (4 levels) - only when video mode
- Max resolution (6 options) - only when video mode
- Video format (4 options) - only when video mode
- Audio format (4 options)
- Audio quality (4 levels)

### 2.4 Bulk Operations (Context Menu)

Right-click context menu on media list with grouped actions:

**Selection Actions:**
| Action | Shortcut | Description |
|--------|----------|-------------|
| Download Selected | `⌘D` | Download selected items |
| Preview Selected | `⌘P` | Open preview for selected |
| Open in Browser | `⌘O` | Open URL in default browser |
| Copy URLs | `⌘C` | Copy selected URLs |

**Bulk Actions:**
| Action | Shortcut | Description |
|--------|----------|-------------|
| Download All | `⇧⌘D` | Start all downloads |
| Cancel All | `Esc` | Cancel all active/queued |
| Retry Failed | `⌘R` | Retry failed downloads |
| Copy All URLs | `⇧⌘C` | Copy all URLs (newline-separated) |

**Destructive Actions:**
| Action | Shortcut | Description |
|--------|----------|-------------|
| Remove Selected | `Del` | Remove selected items |
| Clear All | `⇧Del` | Clear entire list |

**Developer:**
| Action | Shortcut | Description |
|--------|----------|-------------|
| Debug Console | `⌘\`` | Open debug console window |

Features:
- Smart disable states based on selection/content
- Icons for visual identification
- Synthetic contextmenu re-dispatch for repositioning

### 2.5 Debug Console

Dedicated Tauri window (`/debug` route):

- **Log Aggregation**: `yt-dlp-stderr` events + app-level logs
- **Real-time Streaming**: Live log updates with HH:MM:SS timestamps
- **Search**: Case-insensitive text search with Find Next (wraparound)
- **Highlighting**: Current match syntax highlighting
- **Log Levels**: Color-coded (info=default, warning=yellow, error=red)
- **Media Index Tracking**: Each entry tagged with source media index
- **Memory Management**: 1000 entry limit with FIFO eviction
- **ARIA Live Region**: For accessibility
- **Window Close**: Dedicated close functionality

### 2.6 Filename Safety

#### Output Template
```
With unique ID:    {dir}/{title} [{id}].{ext}
Without unique ID: {dir}/{title}.{ext}
```

#### Unique ID Options

| Type | Format | Example | Use Case |
|------|--------|---------|----------|
| Native | yt-dlp `%(id)s` | `[dQw4w9WgXcQ]` | Truly idempotent per video |
| Hash | 8-char FNV-1a of URL (base36) | `[k8df92a1]` | Consistent format across platforms |

#### yt-dlp Flags
```
--progress-template download:remedia-%(progress._percent_str)s-%(progress.eta)s
--newline
--continue
--no-overwrites
--embed-thumbnail --embed-subs --embed-metadata --embed-chapters
--windows-filenames
```

Windows-specific: `CREATE_NO_WINDOW` flag (0x08000000) to hide console.

### 2.7 Playlist & Channel Support

- **Expansion**: `expand_playlist` command with `--flat-playlist --playlist-items 1-500`
- **Max Items**: 500 (hardcoded `MAX_PLAYLIST_ITEMS`)
- **Deduplication**: HashSet-based URL deduplication
- **Collection Metadata**: `collectionId`, `collectionKind`, `collectionName`, `folderSlug`
- **Collection IDs**: `playlist:{name}` or `channel:{name}`
- **Folder Organization**: Downloads grouped by playlist/channel into subfolders
- **Sanitized Folder Names**: Replaces `/:*?"<>|` with `_`

### 2.8 Window Management

- **Main Window**: Custom title bar with minimize/maximize/close
- **Debug Console**: Preloaded, lazy-show pattern
- **Preview Windows**: Multiple supported, unique labels with timestamps
- **Atomic Creation**: Promise locks prevent race conditions
- **Window Reuse**: Show/focus existing windows instead of creating new
- **WSL2 Detection**: Special close behavior uses quit command

### 2.9 Remote Control (WebSocket)

Debug/testing harness on `ws://127.0.0.1:17814`:
- Enabled by default in debug builds
- Configurable via `ENABLE_REMOTE_HARNESS` env var

**Handshake:** Sends `remote-hello` with PID, timestamp, environment info

**Commands:**

| Command | Parameters | Description |
|---------|------------|-------------|
| `addUrl` | `{url}` | Emit `remote-add-url` event |
| `startDownloads` | - | Emit `remote-start-downloads` |
| `cancelAll` | - | Emit `remote-cancel-downloads` |
| `clearList` | - | Emit `remote-clear-list` |
| `setDownloadDir` | `{path}` | Emit `remote-set-download-dir` |
| `status` | - | Returns `{ok, queued, active, max}` |
| `debugEcho` | `{data}` | Echo as `debug-echo` event |
| `runJs` | `{script}` | Execute JS in main window |
| `runJsCapture` | `{script}` | Execute JS, capture result after 500ms |
| `runJsGetResult` | `{script}` | Execute JS with 2s timeout, multiple result locations |
| `inspectWindow` | `{label}` | Return window visibility/focus state |
| `startDownloadDirect` | `{url, path?, mediaIdx?}` | Direct download bypassing queue |

---

## 3. Architecture

### 3.1 Technology Stack

| Layer | Technology |
|-------|------------|
| Frontend | React 19 + TypeScript (strict mode, `noUncheckedIndexedAccess`) |
| UI Components | shadcn/ui (new-york variant) + Tailwind CSS |
| State Management | Jotai atoms with localStorage persistence |
| Data Table | TanStack Table v8 + TanStack Virtual |
| Icons | Lucide React |
| Backend | Rust + Tauri 2.9 |
| Plugins | tauri-plugin-notification, dialog, shell, clipboard, updater, fs, single-instance |
| Media Engine | yt-dlp (bundled per-platform) |
| WebSocket | tokio-tungstenite |
| Build | Vite (frontend), Cargo (backend) |
| Testing | Vitest, React Testing Library, Playwright, cargo test |

### 3.2 Project Structure

```
src/
├── components/           # React components
│   ├── ui/              # shadcn/ui primitives (Button, Dialog, Select, etc.)
│   ├── MediaTable.tsx   # Virtual-scrolled media list (TanStack Table + Virtual)
│   ├── DownloadControls.tsx  # Bottom control panel
│   ├── DropZone.tsx     # Drag-and-drop URL area
│   ├── SettingsDialog.tsx    # Modal settings wrapper
│   ├── GeneralTab.tsx   # Settings: theme, location, unique ID
│   ├── DownloadsTab.tsx # Settings: mode, concurrency, limits
│   ├── QualityTab.tsx   # Settings: quality, format, resolution
│   ├── SettingsSelect.tsx    # Reusable dropdown
│   ├── SettingsCheckbox.tsx  # Reusable checkbox
│   ├── MediaListContextMenu.tsx  # Right-click menu
│   ├── CustomTitleBar.tsx    # Native window controls
│   └── DebugConsole.tsx      # Log viewer window
├── hooks/               # Custom React hooks
│   ├── useTauriEvents.ts     # Centralized event subscription
│   ├── useMediaList.ts       # Media list state (Map-based, O(1))
│   ├── useDownloadManager.ts # Download orchestration
│   ├── useQueueStatus.ts     # Queue polling (100ms debounce)
│   ├── useClipboardMonitor.ts # Clipboard auto-import (500ms cooldown)
│   ├── useWindowManager.ts   # Atomic window creation (promise locks)
│   ├── usePreviewLauncher.ts # Preview window creation
│   ├── useRemoteControl.ts   # Remote API event handling
│   └── useTheme.ts           # Theme application (system preference detection)
├── state/               # Jotai atoms
│   ├── settings-atoms.ts     # All user preferences (localStorage)
│   ├── app-atoms.ts          # Row selection, log entries
│   └── collection-atoms.ts   # Playlist/channel metadata
├── types/               # TypeScript definitions
│   └── index.ts              # Events, commands, settings types
├── utils/               # Pure utility functions
│   ├── media-helpers.ts      # URL validation, progress calc, timestamps
│   ├── log-helpers.ts        # Log search, highlighting, level classes
│   └── clipboard-helpers.ts  # Cooldown enforcement, clipboard processing
├── App.tsx              # Main orchestrator
├── player.tsx           # Preview window component
└── main.tsx             # Entry point with routing

src-tauri/src/
├── lib.rs               # Tauri app setup, plugin registration, command exports
├── remedia.rs           # App-level commands (quit, always-on-top, WSL detection)
├── downloader/          # Download system
│   ├── mod.rs           # Module exports
│   ├── commands.rs      # Tauri command handlers
│   ├── subprocess.rs    # Process lifecycle, cancellation flags
│   ├── ytdlp.rs         # Low-level yt-dlp execution
│   ├── playlist.rs      # Playlist parsing, deduplication
│   ├── media_info.rs    # Metadata extraction, provider overrides
│   ├── progress.rs      # Progress parsing from "remedia-" markers
│   ├── settings.rs      # Settings validation, format building
│   └── events.rs        # Event constants and emission
├── download_queue.rs    # Queue struct, concurrency control, pump task
├── remote_control.rs    # WebSocket server, command handling
├── redgifs.rs           # RedGifs API client, token management
├── thumbnail.rs         # Thumbnail extraction helpers
├── logging.rs           # Structured JSON logging, rotation
└── error.rs             # Error codes, FrontendError struct
```

### 3.3 Data Flow

```
┌─────────────────────────────────────────────────────────────┐
│                        FRONTEND                              │
│  ┌───────────┐   ┌────────────┐   ┌──────────────────────┐ │
│  │ DropZone  │──▶│ MediaList  │──▶│ DownloadManager Hook │ │
│  │ Clipboard │   │ (Map-based)│   │ (orchestrates)       │ │
│  └───────────┘   └────────────┘   └──────────────────────┘ │
│        │               │                    │               │
│        │               │    invoke()        │               │
│        ▼               ▼                    ▼               │
│  ┌──────────────────────────────────────────────────────┐  │
│  │              useTauriEvents (centralized)             │  │
│  └──────────────────────────────────────────────────────┘  │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│                        BACKEND (Rust)                        │
│  ┌────────────────┐   ┌─────────────┐   ┌────────────────┐ │
│  │ get_media_info │   │DownloadQueue│   │ download_media │ │
│  │ expand_playlist│   │ (VecDeque + │   │ (subprocess)   │ │
│  └───────┬────────┘   │  HashSet)   │   └───────┬────────┘ │
│          │            └──────┬──────┘           │          │
│          │                   │                  │          │
│          └───────────────────┴──────────────────┘          │
│                              │                              │
│                    emit() + broadcast()                     │
└──────────────────────────────┬──────────────────────────────┘
                               │
              ┌────────────────┼────────────────┐
              ▼                ▼                ▼
┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐
│   Main Window   │  │  Debug Console  │  │ WebSocket Clients│
│   (Frontend)    │  │    Window       │  │  (Remote Harness)│
└─────────────────┘  └─────────────────┘  └─────────────────┘
```

### 3.4 State Management

#### Settings Atoms (`settings-atoms.ts`)
Persisted to localStorage via `atomWithStorage`:
- All download settings (mode, quality, format, limits)
- UI preferences (always-on-top, theme, clipboard)
- Download location path

#### App Atoms (`app-atoms.ts`)
```typescript
tableRowSelectionAtom: Record<string, boolean>  // Row selection state
logEntriesAtom: LogEntry[]                      // Max 1000 entries
addLogEntryAtom: (entry: LogEntry) => void      // Write-only append
```

#### Collection Atoms (`collection-atoms.ts`)
```typescript
collectionsAtom: Record<string, Collection>     // Collection metadata by ID
upsertCollectionsAtom: (collection) => void     // Write-only upsert
```

### 3.5 Hooks Architecture

| Hook | Responsibility | Key Features |
|------|---------------|--------------|
| `useMediaList` | Media list state | Map-based O(1), ref sync, chunked fetches (5 concurrent) |
| `useDownloadManager` | Download orchestration | Progress calc, retry logic (4x), settings collection |
| `useQueueStatus` | Queue monitoring | 100ms debounce, event-driven refresh |
| `useTauriEvents` | Event subscription | Handler registry, test injection, cleanup |
| `useClipboardMonitor` | Clipboard import | 500ms cooldown, focus detection |
| `useWindowManager` | Window lifecycle | Promise locks, existence checking |
| `usePreviewLauncher` | Preview windows | Multi-item, unique labels, notification check |
| `useRemoteControl` | Remote API | Pending start scheduling |
| `useTheme` | Theme application | System preference detection, CSS class toggle |

---

## 4. API Reference

### 4.1 Tauri Commands

#### Download Commands

| Command | Parameters | Returns | Description |
|---------|------------|---------|-------------|
| `get_media_info` | `mediaIdx: i32, mediaSourceUrl: String` | `Result<(), String>` | Extract metadata, emits `update-media-info` |
| `expand_playlist` | `mediaSourceUrl: String` | `Result<PlaylistExpansion, String>` | List playlist items (max 500) |
| `download_media` | `mediaIdx, mediaSourceUrl, outputLocation, subfolder?, settings` | `()` | Queue and start download |
| `cancel_download` | `mediaIdx: i32` | `()` | Cancel specific download |
| `cancel_all_downloads` | - | `Vec<i32>` | Cancel all, return cancelled indices |
| `set_max_concurrent_downloads` | `maxConcurrent: usize` | `Result<(), String>` | Adjust concurrency (min 1) |
| `get_queue_status` | - | `(usize, usize, usize)` | `(queued, active, maxConcurrent)` |

#### Window Commands

| Command | Parameters | Returns | Description |
|---------|------------|---------|-------------|
| `open_preview_window` | `url, title?, width?, height?` | `Result<(), String>` | Open preview (default 800x600) |
| `set_always_on_top` | `alwaysOnTop: bool` | `Result<(), String>` | Toggle always-on-top (no-op iOS/Android) |

#### App Commands

| Command | Parameters | Returns | Description |
|---------|------------|---------|-------------|
| `quit` | - | `()` | Graceful app shutdown |
| `is_wayland` | - | `bool` | Check `XDG_SESSION_TYPE` for "wayland" |
| `is_wsl` | - | `bool` | Detect WSL via `is_wsl` crate |
| `is_wsl2` | - | `bool` | Detect WSL2 via `/proc/version` |
| `get_wsl_window_close_behavior` | - | `String` | Returns `"wsl2"` \| `"wsl1"` \| `"native"` |

#### Debug Commands (debug builds only)

| Command | Parameters | Returns | Description |
|---------|------------|---------|-------------|
| `debug_broadcast` | `data: Value` | `()` | Broadcast to remote clients |

### 4.2 Events

#### Media Events

| Event | Payload | Description |
|-------|---------|-------------|
| `update-media-info` | `[idx, url, title, thumbnail, previewUrl, uploader, collectionId?, kind?, name?, slug?]` | Metadata extracted |
| `download-progress` | `[idx, percent]` | Progress update (0-100) |
| `download-complete` | `idx` | Download succeeded |
| `download-error` | `idx` | Download failed |
| `download-error-detail` | `[idx, reason]` | Error with reason string |
| `download-cancelled` | `idx` | Download cancelled |

#### Queue Events

| Event | Payload | Description |
|-------|---------|-------------|
| `download-queued` | `idx` | Added to queue |
| `download-started` | `idx` | Download began |
| `download-invoke-ack` | `[idx, url]` | Download command acknowledged |

#### Debug Events

| Event | Payload | Description |
|-------|---------|-------------|
| `yt-dlp-stderr` | `[idx, message]` | Filtered yt-dlp stderr (errors/warnings only) |
| `download-exec` | `[idx, url, outputLocation]` | Download execution trace |
| `download-raw` | `[idx, "stdout"\|"stderr", line]` | Raw subprocess output |
| `download-invoke` | `[idx, url]` | Download invoked |
| `debug-echo` | `data` | Echo from remote client |
| `debug-snapshot` | `{kind, data}` | Unified debug event |

#### Remote Control Events

| Event | Payload | Description |
|-------|---------|-------------|
| `remote-add-url` | `string` | Add URL from WebSocket |
| `remote-start-downloads` | `undefined` | Start all downloads |
| `remote-cancel-downloads` | `undefined` | Cancel all downloads |
| `remote-clear-list` | `undefined` | Clear media list |
| `remote-set-download-dir` | `path` | Set output directory |
| `remote-recv` | `message` | Raw WebSocket message received |

### 4.3 Type Definitions

#### Frontend Types

```typescript
// Media item status
type MediaStatus = "Pending" | "Queued" | "Downloading" | "Done" | "Error" | "Cancelled";

// Collection kind
type CollectionKind = "playlist" | "channel" | "single";

// Media list item
interface VideoInfo {
  id: string;
  url: string;
  title: string;
  thumbnail?: string;
  previewUrl?: string;
  subfolder?: string;
  audioOnly: boolean;
  progress: number;
  status: MediaStatus;
  collectionType?: CollectionKind;
  collectionName?: string;
  folderSlug?: string;
  collectionId?: string;
}

// Log entry for debug console
interface LogEntry {
  timestamp: number;
  source: "yt-dlp" | "app";
  level: "info" | "warn" | "error";
  message: string;
  mediaIdx?: number;
}

// Download settings
interface DownloadSettings {
  downloadMode: "video" | "audio";
  videoQuality: "best" | "high" | "medium" | "low";
  maxResolution: "2160p" | "1440p" | "1080p" | "720p" | "480p" | "no-limit";
  videoFormat: "mp4" | "mkv" | "webm" | "best";
  audioFormat: "mp3" | "m4a" | "opus" | "best";
  audioQuality: "0" | "2" | "5" | "9";
  downloadRateLimit: string;
  maxFileSize: string;
  appendUniqueId: boolean;
  uniqueIdType: "native" | "hash";
}

// Playlist expansion result
interface PlaylistExpansion {
  playlistName?: string;
  uploader?: string;
  entries: PlaylistEntry[];
  collectionId?: string;
  collectionKind?: CollectionKind;
  collectionName?: string;
  folderSlug?: string;
}

interface PlaylistEntry {
  url: string;
  title?: string;
}

// Event payload types
type MediaProgressEvent = [number, number];  // [mediaIdx, progress]
type MediaInfoEvent = [number, string, string, string, string, string | null,
                       string | null, CollectionKind | null, string | null, string | null];
type YtDlpStderrEvent = [number, string];
```

#### Backend Types (Rust)

```rust
// Queue status
pub enum DownloadStatus {
    Queued, Downloading, Completed, Failed, Cancelled
}

pub struct QueuedDownload {
    pub media_idx: i32,
    pub url: String,
    pub output_location: String,
    pub settings: String,  // JSON serialized
    pub subfolder: Option<String>,
    pub status: DownloadStatus,
}

// Error system
pub enum ErrorCode {
    // Validation (E_VAL_*)
    EValInvalidUrl, EValInvalidSettings, EValInvalidPath, EValInvalidMediaIdx,
    // IO (E_IO_*)
    EIoReadFailed, EIoWriteFailed, EIoNotFound, EIoPermissionDenied,
    // Download (E_DL_*)
    EDlSpawnFailed, EDlProcessFailed, EDlCancelled, EDlTimeout, EDlOutputUnavailable,
    // Network (E_NET_*)
    ENetConnectionFailed, ENetTimeout, ENetRateLimited,
    // Queue (E_Q_*)
    EQueueFull, EQueueDuplicate, EQueueNotFound,
    // Internal (E_INT_*)
    EInternal, EIntSerializeFailed, EIntLockPoisoned,
}

pub struct FrontendError {
    pub code: &'static str,  // e.g., "E_VAL_INVALID_URL"
    pub message: String,
    pub retryable: bool,
}

// Retryable errors:
// E_NET_CONNECTION_FAILED, E_NET_TIMEOUT, E_NET_RATE_LIMITED,
// E_DL_TIMEOUT, E_DL_PROCESS_FAILED
```

### 4.4 Validation Rules

| Field | Rule | Limit |
|-------|------|-------|
| URL | Must start with `http://` or `https://` | Max 4096 chars |
| Output Path | Non-empty string | Max 1024 chars |
| Media Index | >= 0 | - |
| Rate/Size | Positive number with optional K\|M\|G suffix, or "unlimited" | Case-insensitive |

---

## 5. Quality Standards

### 5.1 Testing Requirements

| Category | Framework | Target | Current |
|----------|-----------|--------|---------|
| Unit Tests | Vitest | 100+ | 129 |
| Component Tests | React Testing Library | 50+ | 60+ |
| E2E Tests | Playwright | 25+ | 25 |
| Rust Tests | cargo test | 35+ | 36 |
| Coverage | Combined | 80%+ | ~80% |

#### Test Commands
```bash
bun run test              # Unit tests (watch mode)
bun run test:run          # Unit tests (single run)
bun run test:coverage     # Coverage report
bun run test:e2e          # E2E tests (Playwright)
bun run test:e2e:headed   # E2E with visible browser
bun run test:remote       # WebSocket harness tests
bun run test:real-download # Real download smoke test
cargo test --manifest-path src-tauri/Cargo.toml  # Rust tests
```

#### Test Infrastructure
- E2E helpers: `window.__E2E_addUrl()`, `window.__E2E_emitTauriEvent()`
- Debug helpers: `window.__DEBUG_MEDIA_LIST`
- Test IDs on major components
- Mock Tauri API support via `TauriApiContext`

### 5.2 Accessibility

| Requirement | Implementation |
|-------------|----------------|
| ARIA labels | All buttons, inputs, custom controls, title bar buttons, log regions |
| Keyboard navigation | Tab order, Enter activation, Arrow keys for menus, Escape to close |
| Focus management | Dialog focus trap, first input focus on open, return focus on close |
| Screen reader | `aria-live` regions for progress announcements, `sr-only` text |
| Context menu | Escape to close, arrow navigation, focus trap |
| Semantic HTML | Proper heading/button/input usage |

### 5.3 Performance

| Metric | Target | Implementation |
|--------|--------|----------------|
| Large lists | 1000+ items smooth | @tanstack/react-virtual (96px rows, 5 overscan) |
| Progress updates | No UI jank | 100ms debounce |
| Media lookup | O(1) | Map-based storage |
| Memory | Bounded logs | 1000 entry limit (FIFO) |
| Concurrency | Controlled | Max 3 default, configurable 1-10 |
| Settings sync | Minimal | 150ms debounce to backend |
| Metadata fetches | Parallel | 5 concurrent chunked fetches |

### 5.4 Error Handling

#### Error Categories
- **Validation (E_VAL_*)**: Invalid URL, settings, path, media index
- **IO (E_IO_*)**: Read/write failures, not found, permission denied
- **Download (E_DL_*)**: Spawn failed, process failed, cancelled, timeout
- **Network (E_NET_*)**: Connection failed, timeout, rate limited
- **Queue (E_Q_*)**: Full, duplicate, not found
- **Internal (E_INT_*)**: Internal error, serialization, lock poisoned

#### Error Flow
1. Backend catches error → creates `FrontendError` with code and retryable flag
2. Emits `download-error` event (or `download-error-detail` with reason)
3. Frontend receives → categorizes error type
4. Toast notification with user-friendly message
5. Retry action offered for retryable errors
6. Detailed info logged to debug console

#### ErrorBoundary
- Wraps critical components
- Fallback UI with recovery options
- Prevents full app crash

### 5.5 Logging System

#### Structured JSON Logging
```json
{
  "timestamp_ms": 1234567890,
  "level": "error",
  "category": "download",
  "message": "Download failed",
  "context": {"mediaIdx": 5},
  "details": "Connection timeout"
}
```

#### Log Levels
- Error, Warn, Info, Debug
- Controlled via `REMEDIA_LOG_LEVEL` environment variable
- Default: Info

#### Log Files
- yt-dlp stderr: `logs/remedia-yt-dlp.log` (with media_idx prefix)
- Error log: `logs/remedia-errors.log` (JSON lines)
- Location: Tauri config directory

#### Log Rotation
- Max file size: 1MB
- Single rotation: `.log` → `.log.1`

---

## 6. Development Reference

### 6.1 Quick Start

**Prerequisites:**
- Node.js 18+ and Bun
- Rust 1.70+
- Platform-specific Tauri dependencies (see README.md)

**Commands:**
```bash
bun install                    # Install dependencies
bun tauri dev                  # Development with hot reload
bun run build                  # Build frontend
bun tauri build                # Build complete application
bun run lint                   # Run oxlint
bun run fmt                    # Format with oxfmt
bun run test                   # Run unit tests
```

### 6.2 Key Libraries

| Library | Documentation |
|---------|---------------|
| Tauri 2 | https://v2.tauri.app/plugin/ |
| yt-dlp | https://github.com/yt-dlp/yt-dlp#readme |
| Jotai | https://jotai.org/docs/utilities/storage |
| TanStack Table | https://tanstack.com/table/v8 |
| TanStack Virtual | https://tanstack.com/virtual/v3 |
| shadcn/ui | https://ui.shadcn.com/docs |
| Lucide Icons | https://lucide.dev/icons/ |
| tokio-tungstenite | https://docs.rs/tokio-tungstenite |

### 6.3 yt-dlp Reference

Key README sections:

| Section | Use Case |
|---------|----------|
| OUTPUT TEMPLATE | Filename patterns: `%(id)s`, `%(title)s`, `%(ext)s` |
| FORMAT SELECTION | `-f` expressions, quality selection |
| FILESYSTEM OPTIONS | `--windows-filenames`, `--no-overwrites` |
| DOWNLOAD OPTIONS | Rate limiting, file size limits |
| POST-PROCESSING | `--embed-thumbnail`, `--extract-audio` |

### 6.4 Environment Variables

| Variable | Purpose | Default |
|----------|---------|---------|
| `ENABLE_REMOTE_HARNESS` | Enable WebSocket server | `true` (debug) |
| `REMEDIA_LOG_LEVEL` | Logging verbosity | `info` |
| `TAURI_ENVIRONMENT` | Environment identifier | auto-detected |

### 6.5 Issue Tracking

This project uses **bd (beads)** for all issue tracking.

```bash
bd ready              # List ready issues
bd list               # List all issues
bd show <id>          # Show issue details
bd create             # Create new issue
bd close <id>         # Close issue
```

Do **not** use markdown TODOs or TODO.md for tracking work.

### 6.6 Code Style

- **TypeScript**: Strict mode with `noUncheckedIndexedAccess`
- **Linting**: oxlint (type-aware)
- **Formatting**: oxfmt
- **Rust**: `cargo fmt`, `cargo clippy`
- **Commits**: Conventional commits recommended

### 6.7 Remote Console

Interactive debug console for the WebSocket harness:

```bash
# Interactive REPL
bun scripts/remote-console.ts

# Batch mode
bun scripts/remote-console.ts \
  --cmd ":clear" \
  --cmd ":dir C:/tmp/remedia" \
  --cmd ":add https://example.com/video" \
  --cmd ":start" \
  --wait-event download-complete

# Remote instance
bun scripts/remote-console.ts --url ws://192.168.1.42:17814
```

Shortcuts: `:add`, `:dir`, `:start`, `:cancel`, `:status`, `:js`, `:jsfile`, `:raw`

---

## Appendix: Migration from Previous Specs

This document consolidates:
- `specs/app-improvements.md` (product features, phases 0-7)
- `specs/IMPLEMENTATION_PLAN.md` (quality/testing phases 1-7)
- `README.md` (usage, architecture overview)
- `docs/ipc-contracts.md` (API reference)

Status tracking has been moved to `bd` (beads). The old `TODO.md` is deprecated.
