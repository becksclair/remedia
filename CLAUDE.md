# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

ReMedia is a Tauri-based desktop media downloader that uses yt-dlp to extract and download media from URLs. It features a React/TypeScript frontend with shadcn/ui components and a Rust backend.

## Development Commands

### Building and Development

- `bun run dev` - Start frontend dev server (port 1420)
- `bun tauri dev` - Start full Tauri development with hot reload
- `bun run build` - Build frontend for production  
- `bun tauri build` - Build complete application

### Code Quality

- `bun run check` - Run Biome linter and formatter (use this for lint/typecheck)

### Component Management

- `bun run sh-add [component-name]` - Add new shadcn/ui component
- `bun run sh-up` - Update existing shadcn/ui components

## Architecture

### Frontend Structure (`src/`)

- **Entry Points**: `main.tsx` routes to either main App or Player based on URL path
- **State Management**: Jotai atoms in `src/state/` - use atomic patterns over context
  - `app-atoms.ts` - Transient UI state (table selections)
  - `settings-atoms.ts` - Persistent settings with localStorage
- **UI Components**: shadcn/ui components in `src/components/ui/` using "new-york" variant
- **Main Application**: `App.tsx` - Core media list management, drag/drop, download orchestration
- **Player Window**: `player.tsx` - Separate preview window for media playback

### Backend Structure (`src-tauri/src/`)

- **Core Logic**: `downloader.rs` - yt-dlp integration, progress tracking, metadata extraction
- **App Setup**: `lib.rs` - Tauri plugins, window management, command handlers
- **External Binary**: yt-dlp binaries in `src-tauri/helpers/` for cross-platform support

### Key Data Flow

1. URLs added via drag/drop or clipboard detection
2. Frontend invokes `get_media_info` → Rust calls yt-dlp for metadata
3. Rust emits `update-media-info` events back to frontend
4. Download initiated via `download_media` → Progress tracked via `download-progress` events
5. Completion/errors communicated via `download-complete`/`download-error` events

## Code Style and Conventions

### Biome Configuration

- Tab indentation (4 spaces)
- 120 character line width
- Semicolons as needed, no trailing commas
- Double quotes for JSX attributes

### State Management Patterns

```typescript
// Use atomWithStorage for persistent settings
const downloadLocationAtom = atomWithStorage<string>('downloadLocation', '')

// Regular atoms for transient state  
const tableRowSelectionAtom = atom<RowSelectionState>({})
```

### Tauri Event Communication

```rust
// Emit from Rust backend
window.emit("download-progress", (media_idx, progress)).unwrap();
```

```typescript
// Listen in React frontend
useTauriEvents({
  "download-progress": handleProgress,
  "update-media-info": handleMediaInfo
});
```

### Component Patterns

- Use shadcn/ui composition pattern with `cn()` utility
- TanStack Table for data grids with row selection
- Controlled dialog components for modals

## Important Implementation Details

### yt-dlp Integration

- Binary resolution handles cross-platform executable selection
- JSON output parsing for comprehensive metadata extraction
- Stdout buffering for real-time progress parsing
- Robust error handling for unsupported URLs and network issues

### Window Management

- Main window: Media list and download management
- Preview windows: Separate player instances opened via `open_preview_window`
- Custom title bar support (currently commented out)

### File System

- Download location managed via persistent Jotai atom
- Cross-platform path handling through Tauri APIs
- Default to user's download directory

### Multi-platform Considerations

- yt-dlp binaries for Windows (.exe), macOS, Linux variants
- Platform-specific UI adjustments (Wayland detection)
- Permission handling for notifications across platforms

## Testing and Debugging

- Use Tauri dev tools for frontend debugging
- Rust backend logs available in development console
- yt-dlp output captured and parsed for error diagnostics
