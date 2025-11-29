# ReMedia Agent Guidelines

> **Project Phase**: Production-ready. Apply full engineering rigor: validation, error handling, security, comprehensive testing.

ReMedia is a Tauri desktop media downloader using yt-dlp. React/TypeScript frontend (shadcn/ui) + Rust backend.

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

**Before completion**: Run `bun fmt`, `bun lint`, `bun test`

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

## Implementation Notes

**yt-dlp**: Cross-platform binary resolution · JSON metadata parsing · Real-time progress via stdout · Robust error handling

**Windows**: Main (media list) · Preview (player via `open_preview_window`)

**Multi-platform**: Windows/macOS/Linux binaries · Wayland detection · Notification permissions

**Debugging**: Tauri dev tools · Rust console logs · yt-dlp output parsing · Playwright E2E
