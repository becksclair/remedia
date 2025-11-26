# ReMedia Implementation Status & TODO

## 📊 **IMPLEMENTATION PROGRESS**

**Overall**: ~75% complete (20/27 major features)

**Completed**: Phases 0-5, Critical bug fixes, Testing expansion
**In Progress**: Integration testing
**Pending**: Virtual scrolling, Accessibility, Production polish

---

## ✅ **CRITICAL FIXES COMPLETED**

### Bug 1: TypeScript/Rust Type Mismatch (FIXED)

- [x] `src/types/index.ts` - Added `downloadRateLimit` and `maxFileSize` fields
- [x] `useDownloadManager.ts` - Now passes rate limit and file size settings to backend

### Bug 2: Player Window Error Handling (FIXED)

- [x] `player.tsx` - Added error state for failed media loads
- [x] `player.tsx` - Added loading indicator while media buffers
- [x] `player.tsx` - Added retry button for failed loads
- [x] `player.tsx` - Restored ReactPlayer for YouTube/Vimeo/SoundCloud support
- [x] `player.tsx` - Added audio detection with visual UI for audio files

---

## ✅ **COMPLETED AREAS**

### Phase 0 – Baseline & Instrumentation

- [x] Build & test health: 0 lint errors, builds pass
- [x] Dev logging: `yt-dlp-stderr` events implemented
- [x] E2E testing: Playwright setup with GitHub Actions (25+ tests)
- [x] Vitest unit tests: 129 tests passing

### Core Infrastructure

- [x] Documentation: `architecture.md`, `dev-setup.md`, `ipc-contracts.md`
- [x] TypeScript strictness: Strict mode with `noUncheckedIndexedAccess`
- [x] State management: Jotai atoms with localStorage persistence
- [x] UI framework: shadcn/ui components (new-york variant)
- [x] Event handling: Centralized `useTauriEvents` hook
- [x] Tauri API DI: `TauriApiContext` for testability
- [x] Error boundaries: `ErrorBoundary` component implemented

### Phase 1 – Progress & Thumbnails

- [x] Progress parsing: Uses `_percent_str` with debouncing (100ms)
- [x] Progress clamping: 0-100 range enforced
- [x] Thumbnail extraction: Multi-field fallback strategy in `thumbnail.rs`
- [x] Placeholder image: SVG placeholder for missing thumbnails

### Phase 2 – Filename Safety

- [x] Output template: `%(title)s [%(id)s].%(ext)s`
- [x] Windows safety: `--windows-filenames` flag
- [x] No overwrites: `--no-overwrites` flag

### Phase 3 – Advanced Download Settings

- [x] Settings atoms: All quality/format atoms implemented
- [x] Rate limit atom: `downloadRateLimitAtom`
- [x] File size atom: `maxFileSizeAtom`
- [x] Settings dialog: Full UI with conditional video/audio sections
- [x] Rust validation: `validate_settings()` with comprehensive checks

### Phase 4 – Context Menu & Bulk Operations

- [x] Context menu: `MediaListContextMenu` component
- [x] Download all: Triggers batch download
- [x] Cancel all: `cancel_all_downloads` command
- [x] Remove selected/all: Frontend state operations
- [x] Copy all URLs: Clipboard API with fallback
- [x] Show Debug Console: Opens `/debug` route

### Phase 5 – Debug Console

- [x] Debug window: `/debug` route in `main.tsx`
- [x] DebugConsole component: Log display with timestamps
- [x] Log aggregation: `logEntriesAtom` in `app-atoms.ts`
- [x] Search functionality: Find Next with highlighting
- [x] Log level detection: error/warn/info classification

### Phase 6 – Concurrency Control (Partial)

- [x] Download queue: `DownloadQueue` struct in Rust (353 lines, 12 tests)
- [x] Max concurrent setting: `maxConcurrentDownloadsAtom`
- [x] Queue status API: `get_queue_status` command
- [x] Queue events: `download-queued`, `download-started`

---

## ❌ **REMAINING WORK**

### Phase 6 – Performance (Incomplete)

- [ ] Virtual scrolling for large lists (100+ items)
- [ ] Memoization optimizations in MediaTable

### Phase 7 – Testing & Quality

- [x] React component tests for DebugConsole
- [x] Tests for useMediaList hook (18 tests)
- [x] Tests for useDownloadManager hook (9 tests)
- [x] Tests for SettingsDialog (14 tests)
- [x] Integration tests for download flow (6 tests)
- [ ] Tests for: MediaTable, DownloadControls (remaining components)
- [ ] Rust tests: verify all 30+ tests pass

### Phase 8 – Accessibility

- [ ] ARIA labels on all interactive elements
- [ ] Keyboard navigation for context menu
- [ ] Focus management in dialogs
- [ ] Screen reader testing

### Phase 9 – Production Readiness

- [ ] Cross-platform build testing (Windows, macOS, Linux)
- [ ] Release workflow automation
- [ ] Auto-updater configuration (optional)

---

## 🎯 **IMMEDIATE PRIORITIES**

1. ~~**[CRITICAL]** Fix DownloadSettings type sync (TS ↔ Rust)~~ ✅
2. ~~**[CRITICAL]** Wire rate limit & file size to useDownloadManager~~ ✅
3. ~~**[HIGH]** Add Player error handling~~ ✅
4. ~~**[HIGH]** Unique ID filename toggle feature~~ ✅
5. **[MEDIUM]** Add remaining React component tests (MediaTable, DownloadControls)
6. **[MEDIUM]** Implement virtual scrolling
7. **[LOW]** Verify Rust tests pass

---

## ✅ **COMPLETED: Unique ID Filename Toggle (v2)**

**Feature**: Settings toggle to append unique ID to downloaded filenames with choice of ID type.
- Format: `"My Video [dQw4w9WgXcQ].mp4"` (native) or `"My Video [k8df92a1].mp4"` (hash)
- **Native ID**: Uses yt-dlp's `%(id)s` - truly idempotent per video (handles URL variations)
- **Short Hash**: 8-char FNV-1a hash of URL - consistent format across all platforms

### Tasks (All Complete)

- [x] Add `appendUniqueId` + `uniqueIdType` atoms in `src/state/settings-atoms.ts`
- [x] Add `append_unique_id` + `unique_id_type` fields to `DownloadSettings` in Rust
- [x] Implement conditional output template (native vs hash mode)
- [x] Shorten custom hash from 11 to 8 chars (still ~2.8 trillion unique values)
- [x] Add toggle UI with type dropdown and filename preview
- [x] Add Rust unit tests for ID generation (5 tests)
- [x] Add TypeScript tests for settings (3 tests)
- [x] Verify lint/build/tests pass (132 TS tests, 26 Rust tests)

---

## 📝 **DETAILED TASK BREAKDOWN**

### Critical Fix 1: Type Sync (COMPLETED)

**`src/types/index.ts`**
- [x] Add `downloadRateLimit: string` to DownloadSettings
- [x] Add `maxFileSize: string` to DownloadSettings

**`src/hooks/useDownloadManager.ts`**
- [x] Import `downloadRateLimitAtom`, `maxFileSizeAtom`
- [x] Read atoms with `useAtomValue`
- [x] Include in settings object passed to `downloadMedia`

### Critical Fix 2: Player Error Handling (COMPLETED)

**`src/player.tsx`**
- [x] Add error state for failed loads
- [x] Add loading spinner while buffering
- [x] Display error message with URL when playback fails
- [x] Add retry button for recovery

### Testing Expansion

**React Component Tests**
- [x] `SettingsDialog.test.tsx`: Form persistence, rendering (14 tests)
- [ ] `MediaTable.test.tsx`: Row selection, remove actions
- [ ] `DownloadControls.test.tsx`: Button states, progress display
- [x] `useMediaList.test.tsx`: Add/update/remove operations (18 tests)
- [x] `useDownloadManager.test.tsx`: Download flow, cancellation (9 tests)

**Integration Tests**
- [x] `download-flow.test.tsx`: Full URL → download cycle (6 tests)

**Rust Tests**
- [ ] Verify all existing tests pass: `cargo test --manifest-path src-tauri/Cargo.toml`
- [ ] Add tests for `thumbnail.rs` edge cases
- [ ] Add tests for `remote_control.rs`

### Virtual Scrolling

**Dependencies**
- [ ] Install `@tanstack/react-virtual`

**`src/components/MediaTable.tsx`**
- [ ] Implement `useVirtualizer` for row virtualization
- [ ] Maintain scroll position on updates
- [ ] Test with 500+ items

### Accessibility

**Global**
- [ ] Audit all buttons/inputs for ARIA labels
- [ ] Add `aria-live` regions for status updates

**Context Menu**
- [ ] Arrow key navigation
- [ ] Escape to close
- [ ] Focus trap

**Dialogs**
- [ ] Focus first input on open
- [ ] Return focus on close

---

## 📋 **VERIFICATION CHECKLISTS**

### Critical Fixes Verification

- [ ] Download with rate limit set - verify yt-dlp receives `--limit-rate`
- [ ] Download with file size limit - verify yt-dlp receives `--max-filesize`
- [ ] Player loads invalid URL - shows error message
- [ ] Player loads slow URL - shows loading indicator

### Testing Verification

- [x] `bun run test:run` - all 129 Vitest tests pass
- [ ] `cargo test --manifest-path src-tauri/Cargo.toml` - all Rust tests pass
- [ ] `bun run test:e2e` - all Playwright tests pass

### Performance Verification

- [ ] Add 200 items to list - UI remains responsive
- [ ] Scroll through 200 items - no jank

### Accessibility Verification

- [ ] Navigate entire app with keyboard only
- [ ] Test with Windows Narrator or NVDA

---

## 🔧 **DEVELOPMENT COMMANDS**

```bash
# Build & Quality
bun run build          # Build frontend
bun tauri build        # Build complete app
bun run lint           # Run oxlint
bun run fmt            # Format code

# Testing
bun run test:run       # Vitest unit tests
bun run test:e2e       # Playwright E2E tests
cargo test --manifest-path src-tauri/Cargo.toml  # Rust tests

# Development
bun tauri dev          # Full dev environment
bun run dev            # Frontend only (port 1420)
```

---

*Last updated: Nov 26, 2025 - Testing expansion and Player improvements completed*
