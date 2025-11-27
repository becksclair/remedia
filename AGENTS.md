# ReMedia Agent Guidelines

> **Project Phase**: Production-ready. Apply full engineering rigor: validation, error handling, security, comprehensive testing.

ReMedia is a Tauri desktop media downloader using yt-dlp. React/TypeScript frontend (shadcn/ui) + Rust backend.

---

## Core Workflow

1. **Read first** – Check existing docs, patterns, lessons learned before coding
2. **Design first** – Define contracts, config vs hardcoded, state boundaries, layer placement, test plan
3. **TDD** – Red (failing tests) → Green (minimal impl) → Refactor (clean up, keep tests passing)

### Feature Development

Explore → Design → Test-first → Implement → Refactor → Integrate → Document/Commit

### Bug Fixing

Reproduce → Locate root cause → Fix (not symptoms) → Add tests/logging

### Refactoring

Justify → Plan → Execute incrementally → Verify all flows

---

## Architecture Principles

**Never**: Hardcode config values · Hide logic in UI · Call UI from core · Store critical state in UI only · Swallow exceptions · Duplicate validation

**Always**: Separate concerns (UI/orchestration/domain/infra) · Define contracts · Validate at boundaries · Log with context · Return explicit results · Use async I/O

---

## Commands

| Action | Command |
|--------|---------|
| Dev server | `bun run dev` (port 1420) |
| Full dev | `bun tauri dev` |
| Build frontend | `bun run build` |
| Build app | `bun tauri build` |
| Lint | `bun run lint` / `bun run lint:fix` |
| Format | `bun run fmt` |
| E2E tests | `bun run test:e2e` |
| Add component | `bun run sh-add [name]` |

**Before completion**: Run `bun run fmt`, `bun run lint`, `bun run build`, `bun tauri build`

---

## Project Structure

### Frontend (`src/`)

- `main.tsx` – Routes to App or Player
- `src/state/` – Jotai atoms (prefer atomic over context)
  - `app-atoms.ts` – Transient UI state
  - `settings-atoms.ts` – Persistent settings (localStorage)
- `src/components/ui/` – shadcn/ui "new-york" variant
- `App.tsx` – Media list, drag/drop, downloads
- `player.tsx` – Preview window

### Backend (`src-tauri/src/`)

- `downloader.rs` – yt-dlp integration, progress, metadata
- `lib.rs` – Tauri plugins, windows, commands
- `helpers/` – yt-dlp binaries (cross-platform)

### Data Flow

1. URL added (drag/drop or clipboard)
2. `get_media_info` → yt-dlp metadata → `update-media-info` event
3. `download_media` → `download-progress` events → `download-complete`/`download-error`

---

## Code Style

### TypeScript

- Strict mode + `noUncheckedIndexedAccess`
- Path alias: `@/*` → `./src/*`
- Tab indent, 120 char width, semicolons as needed, double quotes in JSX

### State Patterns

```typescript
// Persistent
const downloadLocationAtom = atomWithStorage<string>('downloadLocation', '')
// Transient
const tableRowSelectionAtom = atom<RowSelectionState>({})
```

### Tauri Events

```rust
window.emit("download-progress", (media_idx, progress)).unwrap();
```
```typescript
useTauriEvents({
  "download-progress": handleProgress,
  "update-media-info": handleMediaInfo
});
```

### UI Patterns

- shadcn/ui composition with `cn()`
- TanStack Table for grids
- Controlled dialogs

---

## Implementation Notes

**yt-dlp**: Cross-platform binary resolution · JSON metadata parsing · Real-time progress via stdout · Robust error handling

**Windows**: Main (media list) · Preview (player via `open_preview_window`)

**File System**: Persistent download location atom · Tauri path APIs · Default to user downloads

**Multi-platform**: Windows/macOS/Linux binaries · Wayland detection · Notification permissions

**Debugging**: Tauri dev tools · Rust console logs · yt-dlp output parsing · Playwright E2E
