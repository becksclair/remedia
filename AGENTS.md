# Remedia

Desktop media downloader. Tauri v2 shell around a React 19 frontend, with Rust backend wrapping yt-dlp.

## Stack

- **Frontend**: React 19 + TypeScript + Vite + Jotai + Tailwind v4 + shadcn/ui
- **Backend**: Rust 2024 edition, Tauri v2, Tokio async, yt-dlp subprocess
- **Tools**: Bun (package manager + test runner), oxlint, oxfmt

## Layout

```text
src/              # React frontend
  hooks/          # useDownloadManager, useTauriEvent, useMediaList
  state/          # Jotai atoms (auto-persist to localStorage)
  utils/          # Pure functions (media-helpers, clipboard-helpers)
  components/ui/  # shadcn/ui primitives
src-tauri/src/    # Rust backend
  lib.rs          # Entry, plugin setup, command registration
  downloader.rs   # Core download logic, yt-dlp spawning
  remote_control.rs # WebSocket test harness (debug builds)
```

## Commands

```bash
# Dev
bun tauri dev           # Full desktop dev
bun run dev             # Frontend only

# Test
bun test                # Unit tests
bun run test:e2e        # Playwright E2E
cargo test --manifest-path src-tauri/Cargo.toml

# Verify
bun run lint            # oxlint
bun run fmt             # oxfmt
```

## Key Patterns

**Tauri commands**: Async fns with `#[tauri::command]`, return `Result<T, String>`. Register in `lib.rs` `generate_handler![]`.

**State**: Jotai atoms in `src/state/`. Atoms persist to localStorage automatically.

**Events**: Rust emits via `window.emit()`. Frontend subscribes via `useTauriEvents` hook. Event types in `src/types/index.ts`.

**Testing**: Tests in `*.test.ts[x]` files. Rust tests use `#[test]` or `#[tokio::test]` in `#[cfg(test)]` modules.

## Critical Files

| Purpose | Location |
|---------|----------|
| App orchestration | `src/App.tsx` |
| Download queue & yt-dlp | `src-tauri/src/downloader.rs` |
| Tauri command registration | `src-tauri/src/lib.rs` |
| Event/command types | `src/types/index.ts` |
| State atoms | `src/state/` |

---

**BEFORE ANYTHING ELSE**: run 'bd onboard' and follow the instructions
