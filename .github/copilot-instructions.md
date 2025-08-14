# ReMedia - AI Coding Instructions

## Project Overview

ReMedia is a Tauri-based desktop media downloader that uses yt-dlp for extracting media from URLs. The frontend is React/TypeScript with shadcn/ui components and the backend is Rust.

## Architecture

### Frontend (src/)

- **State Management**: Jotai atoms in `src/state/` - prefer atomic patterns over context
- **UI Components**: shadcn/ui components in `src/components/ui/` - use the "new-york" style variant
- **Styling**: Tailwind CSS with custom CSS variables, uses tab indentation (4 spaces)
- **Main Flow**: Drag/drop URLs → fetch metadata → download with progress tracking

### Backend (src-tauri/)

- **Core Logic**: `src-tauri/src/downloader.rs` handles yt-dlp integration and progress events
- **External Binary**: yt-dlp binaries in `src-tauri/helpers/` for cross-platform support
- **Events**: Tauri event system for progress updates (`MediaProgressEvent`, `MediaInfoEvent`)

## Key Patterns

### Tauri Communication

```rust
// Emit events from Rust to frontend
window.emit("media-progress", (index, progress)).unwrap();
```

```typescript
// Listen to events in React
useTauriEvents({
  "media-progress": (event: Event<MediaProgressEvent>) => {
    // Handle progress update
  }
});
```

### State Management

- Use `atomWithStorage` for persistent settings (`downloadLocationAtom`, `alwaysOnTopAtom`)
- Regular atoms for transient state (`tableRowSelectionAtom`)
- Import from `jotai` and `jotai/utils`

### Component Patterns

- shadcn/ui components follow composition pattern with `cn()` utility for conditional classes
- Data tables use TanStack Table with row selection
- Forms use shadcn dialog components with controlled state

## Development Workflow

### Commands

- `bun run dev` - Start frontend dev server (port 1420)
- `bun tauri dev` - Start full Tauri development with hot reload, required for testing and screenshots
- `bun run build` - Build frontend for production
- `bun tauri build` - Build complete application
- `bun run check` - Run Biome linter/formatter

### Code Style (Biome)

- Tab indentation (4 spaces)
- 120 character line width
- Semicolons as needed
- No trailing commas
- Double quotes for JSX attributes

### Adding shadcn Components

```bash
bun run sh-add [component-name]  # Add new component
bun run sh-up                    # Update existing components
```

## Integration Points

### yt-dlp Integration

- Binary path resolution in `src-tauri/src/downloader.rs`
- JSON output parsing for media metadata
- Progress parsing via stdout buffering
- Error handling for unsupported URLs

### File System

- Download location managed via Jotai atom with localStorage persistence
- Tauri filesystem plugin for directory operations
- Cross-platform path handling

### Notifications

- Permission-based system using `@tauri-apps/plugin-notification`
- Progress completion alerts

## Critical Files

- `src/App.tsx` - Main application logic and media list management
- `src-tauri/src/downloader.rs` - Core download functionality
- `src/state/` - Application state atoms
- `src/hooks/useTauriEvent.ts` - Event communication pattern
- `components.json` - shadcn/ui configuration

## Common Tasks

- Add new media format support: Extend `YtDlpVideo` struct in `downloader.rs`
- Add UI components: Use shadcn/ui via `bun run sh-add`
- Persist new settings: Create atoms in `src/state/settings-atoms.ts`
- Handle new events: Extend `useTauriEvents` hook usage
