# ReMedia Architecture

## System Overview

ReMedia is a cross-platform desktop application built on the Tauri framework, combining a React/TypeScript frontend with a Rust backend. The application leverages yt-dlp as the core media extraction engine.

## High-Level Architecture

```text
┌─────────────────────────────────────────────────────────────┐
│                    Tauri Application                        │
├─────────────────────────────────────────────────────────────┤
│  Frontend (React/TypeScript)           │  Backend (Rust)    │
│  ┌─────────────────────────────────┐   │  ┌──────────────┐ │
│  │  UI Components (shadcn/ui)      │   │  │  Commands    │ │
│  │  ┌─────────────┐ ┌─────────────┐ │   │  │  - Media    │ │
│  │  │  Main App   │ │  Settings   │ │◄──┼──┤  - Window   │ │
│  │  │  Player     │ │  Dialog     │ │   │  │  - System   │ │
│  │  └─────────────┘ └─────────────┘ │   │  └──────────────┘ │
│  └─────────────────────────────────┘   │  ┌──────────────┐ │
│  ┌─────────────────────────────────┐   │  │  Events      │ │
│  │  State Management (Jotai)       │   │  │  - Progress  │ │
│  │  ┌─────────────┐ ┌─────────────┐ │◄──┼──┤  - Media    │ │
│  │  │ App Atoms   │ │ Settings    │ │   │  │  - Status   │ │
│  │  │ (transient) │ │ (persistent)│ │   │  └──────────────┘ │
│  │  └─────────────┘ └─────────────┘ │   │  ┌──────────────┐ │
│  └─────────────────────────────────┘   │  │  Downloader  │ │
│  ┌─────────────────────────────────┐   │  │  (yt-dlp)    │ │
│  │  Event Handling                 │   │  │              │ │
│  │  ┌─────────────┐ ┌─────────────┐ │   │  └──────────────┘ │
│  │  │ useTauri    │ │ IPC Bridge  │ │   │                   │
│  │  │ Events      │ │ (invoke)    │ │   │                   │
│  │  └─────────────┘ └─────────────┘ │   │                   │
│  └─────────────────────────────────┘   │                   │
└─────────────────────────────────────────────────────────────┘
                              │
                    ┌─────────────────┐
                    │   yt-dlp CLI    │
                    │  (External Tool)│
                    └─────────────────┘
```

## Frontend Architecture

### Component Structure

```text
src/
├── components/
│   ├── ui/                 # shadcn/ui base components
│   │   ├── button.tsx
│   │   ├── dialog.tsx
│   │   ├── table.tsx
│   │   └── ...
│   ├── App.tsx             # Main application component
│   ├── player.tsx          # Media preview window
│   ├── settings-dialog.tsx # Settings configuration
│   ├── data-table.tsx      # Media list table
│   └── CustomTitleBar.tsx  # Window title bar
├── hooks/
│   ├── useTauriEvent.ts    # Event handling hook
│   └── use-window-focus.ts # Window focus management
├── state/
│   ├── app-atoms.ts        # Transient UI state
│   └── settings-atoms.ts   # Persistent settings
├── types/
│   └── index.ts            # Shared type definitions
└── lib/
    └── utils.ts            # Utility functions
```

### State Management

ReMedia uses Jotai for atomic state management:

- **App Atoms** (`app-atoms.ts`): Transient UI state
  - Table row selections
  - Download queue state
  - UI interaction states

- **Settings Atoms** (`settings-atoms.ts`): Persistent configuration
  - Download location
  - Audio/video preferences
  - Window settings
  - Uses `atomWithStorage` for localStorage persistence

### UI Framework

- **Component Library**: shadcn/ui (new-york variant)
- **Styling**: Tailwind CSS v4
- **Icons**: Lucide React
- **Tables**: TanStack Table with row selection
- **Notifications**: Sonner for toast messages

## Backend Architecture

### Module Structure

```text
src-tauri/src/
├── lib.rs              # Application entry point and setup
├── main.rs             # Tauri bootstrap
├── downloader.rs       # yt-dlp integration and media processing
└── remedia.rs          # Window management and system utilities
```

### Core Components

#### Downloader Module (`downloader.rs`)

- **Media Info Extraction**: 
  - Calls yt-dlp with JSON output (`-j` flag)
  - Extracts title, thumbnail, and metadata
  - Emits `update-media-info` events

- **Download Management**:
  - Spawns async yt-dlp processes
  - Parses progress output in real-time
  - Emits `download-progress`, `download-complete`, `download-error` events
  - Handles stdout/stderr streaming

- **Error Handling**:
  - Robust process management
  - Stderr capture and forwarding
  - Graceful failure recovery

#### Application Module (`lib.rs`)

- **Plugin Configuration**:
  - Notification system
  - File system access
  - Dialog management
  - Clipboard integration
  - Shell operations

- **Command Registration**:
  - `get_media_info`: Extract media metadata
  - `download_media`: Initiate download
  - `set_always_on_top`: Window behavior
  - `is_wayland`: Platform detection
  - `open_preview_window`: Media preview
  - `quit`: Application shutdown

#### System Module (`remedia.rs`)

- **Window Management**:
  - Always-on-top functionality
  - Preview window creation
  - Focus and visibility control

- **Platform Detection**:
  - Wayland display server detection
  - Cross-platform compatibility

## Data Flow

### 1. URL Input Processing

```text
User Action (Drag/Drop/Clipboard)
    ↓
App.tsx (URL validation)
    ↓
invoke("get_media_info", { mediaIdx, url })
    ↓
downloader.rs::get_media_info()
    ↓
yt-dlp -j [url] (JSON metadata extraction)
    ↓
emit("update-media-info", [idx, url, title, thumbnail])
    ↓
useTauriEvents() → State update → UI refresh
```

### 2. Download Execution

```text
User Clicks Download
    ↓
App.tsx (download orchestration)
    ↓
invoke("download_media", { idx, url, outputLocation })
    ↓
downloader.rs::download_media()
    ↓
yt-dlp [url] --progress-template ... (async spawn)
    ↓
Real-time progress parsing
    ↓
emit("download-progress", [idx, percent])
    ↓
useTauriEvents() → Progress bar update
    ↓
Process completion → emit("download-complete"/"download-error")
```

### 3. Settings Persistence

```text
Settings Dialog Change
    ↓
Jotai atom update
    ↓
atomWithStorage → localStorage
    ↓
Immediate UI state sync
    ↓
Used in subsequent invoke() calls
```

## Inter-Process Communication (IPC)

### Event-Driven Architecture

The application uses an event-driven IPC pattern:

- **Frontend → Backend**: Tauri `invoke()` commands
- **Backend → Frontend**: Tauri `emit()` events
- **Event Handling**: Centralized via `useTauriEvents()` hook

### Event Types

1. **Media Events**:
   - `update-media-info`: Metadata extraction results
   - `download-progress`: Real-time download progress
   - `download-complete`: Successful download completion
   - `download-error`: Download failure notification

2. **System Events**:
   - `yt-dlp-stderr`: Process error output
   - Window focus/visibility events

## Cross-Platform Considerations

### Binary Distribution

- **yt-dlp Executables**: Platform-specific binaries in `src-tauri/helpers/`
- **Windows**: `.exe` with Windows filename sanitization
- **macOS**: Universal binary support
- **Linux**: AppImage and package distributions

### Platform-Specific Features

- **Single Instance**: Windows and macOS only (Linux excluded via cfg)
- **Wayland Support**: Detection and UI adjustments for Linux
- **File System**: Cross-platform path handling via Tauri APIs
- **Notifications**: Platform-appropriate notification system

## Security Considerations

### Input Validation

- URL validation before yt-dlp invocation
- Path sanitization for output locations
- Command argument escaping to prevent injection

### Sandboxing

- Tauri capability system for API access
- File system access limited to user directories
- Network access controlled through yt-dlp

### Error Handling

- Process isolation for yt-dlp execution
- Stderr capture and user-friendly error messages
- Graceful degradation for unsupported platforms

## Performance Optimizations

### Frontend

- **Virtual Scrolling**: Planned for large download queues
- **State Batching**: Throttled updates for frequent progress events
- **Component Memoization**: Optimized re-renders for table cells

### Backend

- **Async Processing**: Non-blocking yt-dlp execution
- **Stream Parsing**: Real-time progress without buffering delays
- **Resource Management**: Proper cleanup of child processes

## Testing Architecture

### End-to-End Testing

- **Playwright**: Cross-platform E2E test suite
- **Web-Only Tests**: Fast CI feedback without Tauri
- **Event Injection**: `__E2E_emitTauriEvent()` for backend simulation

### Test Utilities

- **Tauri Helpers**: Custom E2E utilities in `e2e/helpers/`
- **Mock Events**: Simulated backend events for isolated testing
- **Platform Coverage**: Windows, macOS, Linux test matrix

This architecture provides a solid foundation for a reliable, cross-platform media downloader with clear separation of concerns and robust error handling.
