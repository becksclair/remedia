# ReMedia Implementation Status & TODO

## 📊 **IMPLEMENTATION PROGRESS**

**Overall**: ~35% complete (10/28 major features)

**Completed**: Infrastructure, Phase 1 (Progress & Thumbnails), Phase 2 (Filename Safety)
**In Progress**: None
**Pending**: Advanced features, bulk operations, debug tools, performance

---

## ✅ **COMPLETED AREAS**

### Phase 0 – Baseline & Instrumentation

- **Build & test health**: ✅ Confirmed working (commands in recent commits)
- **Dev logging**: ✅ `yt-dlp-stderr` events implemented and visible
- **E2E testing**: ✅ Playwright setup completed with GitHub Actions workflow

### Core Infrastructure

- **Documentation**: ✅ Comprehensive docs created (`architecture.md`, `dev-setup.md`, `IPC contracts`)
- **TypeScript strictness**: ✅ Strict mode enabled with proper typing
- **State management**: ✅ Jotai atoms implemented with localStorage persistence
- **UI framework**: ✅ shadcn/ui components with proper composition
- **Event handling**: ✅ Centralized via `useTauriEvents` hook

### Phase 1 – Progress & Thumbnails

- **Progress fixes**: ✅ Fixed 0→99→100 jumping by using yt-dlp's `_percent_stripped` field
- **Thumbnail reliability**: ✅ Enhanced extraction with fallback strategy and added placeholder image

### Phase 2 – Filename Safety

- **Basic sanitization**: ✅ Uses `--windows-filenames` + `--no-overwrites` for collision prevention
- **Output template**: ✅ Updated to `%(title)s [%(id)s].%(ext)s` for unique filenames

### Phase 3 – Advanced Download Settings

- **Quality/Resolution controls**: ✅ Implemented with Select dropdowns
- **Format selection**: ✅ Added video and audio format options
- **Audio-only mode**: ✅ Implemented with proper yt-dlp flags
- **Settings dialog enhancement**: ✅ Replaced placeholder fields with advanced controls

---

## ❌ **NOT YET IMPLEMENTED**

### Phase 4 – Context Menu & Bulk Operations

- **Context menu**: ❌ Not implemented
- **Bulk actions** (Download all, Cancel all, Remove selected): ❌ Not started
- **Cancellation support**: ❌ No backend download manager

### Phase 5 – Debug Console

- **Debug window**: ❌ Not implemented
- **Log aggregation**: ❌ Not started
- **Search functionality**: ❌ Not started

### Phase 6 – Performance & Concurrency

- **Concurrency control**: ❌ Not implemented
- **Virtual scrolling**: ❌ Not started
- **Performance optimizations**: ❌ Not started

### Phase 7 – Testing & Quality Gates

- **Unit tests**: ❌ Not implemented
- **Expanded E2E coverage**: ❌ Basic tests only
- **Platform testing**: ❌ Limited coverage

---

## 🎯 **NEXT PRIORITIES** (based on spec order)

1. **Fix progress jumping issue** (Phase 1.1) - Use yt-dlp's `_percent` field
2. **Implement thumbnail placeholders** (Phase 1.2) - Add fallback images
3. **Enhance filename safety** (Phase 2) - Prevent collisions, add length limits
4. **Build context menu** (Phase 4) - Bulk operations foundation
5. **Add debug console** (Phase 5) - Logging and diagnostics

---

## 📝 **DETAILED TASK BREAKDOWN**

### Phase 1 – Progress & Thumbnails

#### 1.1 Progress fixes

**Backend changes (`downloader.rs`)**
- [ ] Revisit yt-dlp progress template usage
- [ ] Use yt-dlp's built-in `_percent` field instead of manual calculation
- [ ] Template: `download:remedia-%(progress._percent_stripped)s-%(progress.eta)s-%(info.id)s`

**Frontend changes (`App.tsx`)**
- [ ] Add debouncing/smoothing for progress updates
- [ ] Ensure global progress bar robust when `mediaList.length === 0`

#### 1.2 Thumbnail reliability & placeholders

**Backend (`get_media_info`)**
- [ ] Extend JSON parsing to check multiple thumbnail fields
- [ ] Strategy: `thumbnail` → `thumbnails` array → `thumbnail_url` → placeholder

**Frontend (`App.tsx`, table column)**
- [ ] Add static placeholder image (`src/assets/thumbnail-placeholder.svg`)
- [ ] Render placeholder when thumbnail is falsy
- [ ] Add visual indicator for missing thumbnails

### Phase 2 – Filename Safety, Sanitization & Uniqueness

#### 2.1 Output template design (yt-dlp)

- [ ] Implement `%(title)s [%(id)s].%(ext)s` template
- [ ] Add playlist index when applicable
- [ ] Use `--restrict-filenames` option for ASCII-only mode

#### 2.2 Collision & length handling (Rust helper)

- [ ] Create `src-tauri/src/filename.rs` module
- [ ] Implement filename normalization and truncation
- [ ] Add collision detection and variant generation
- [ ] Use `--no-overwrites` to prevent accidental overwrites

#### 2.3 Settings surface for naming

- [ ] Add filename strategy toggle in settings
- [ ] Default: `"Title [ID].ext"` (safe and unique)
- [ ] Advanced: `"Title.ext"` (with collision risks)

### Phase 3 – Advanced Download Settings

#### 3.1 Settings model (Jotai atoms)

- [ ] `downloadModeAtom`: `'video' | 'audio' | 'both'`
- [ ] `videoQualityAtom`: `'best' | 'high' | 'medium' | 'low'`
- [ ] `maxResolutionAtom`: `'2160p' | '1440p' | '1080p' | '720p' | '480p' | 'no-limit'`
- [ ] `videoFormatAtom`: `'mp4' | 'mkv' | 'webm' | 'best'`
- [ ] `audioFormatAtom`: `'mp3' | 'm4a' | 'opus' | 'best'`
- [ ] `audioQualityAtom`: `'best' | 'high' | 'medium' | 'low'`

#### 3.2 Settings dialog UI (shadcn/ui)

- [ ] Remove placeholder fields (`Name`, `Username`)
- [ ] Add advanced settings sections
- [ ] Implement Download mode & quality controls
- [ ] Add Video options and Audio-only options

#### 3.3 Wiring settings to yt-dlp CLI

- [ ] Extend command payload to include settings
- [ ] Translate settings to yt-dlp options:
  - Video format & resolution: `-f` expressions
  - Audio-only mode: `-f bestaudio` with `--extract-audio`
- [ ] Keep simple default path for new users

### Phase 4 – Media List Context Menu & Bulk Operations

#### 4.1 UI implementation (shadcn Context Menu + TanStack Table)

- [ ] Wrap `DataTable` with `ContextMenu` from shadcn/ui
- [ ] Implement required menu items:
  - Download all
  - Cancel all
  - Remove selected
  - Remove all
  - Copy all URLs
  - Show DevTools
  - Show Debug Console
- [ ] Ensure compatibility with row selection

#### 4.2 Action semantics & backend support

- [ ] **Download all**: Trigger `startDownload` for all/selected entries
- [ ] **Cancel all**:
  - Create `DownloadManager` in Rust
  - Add `cancel_download(media_idx)` command
  - Add `cancel_all_downloads()` command
  - Emit `"download-cancelled"` events
- [ ] **Remove selected / Remove all**: Frontend operations on `mediaList`
- [ ] **Copy all URLs**: Use `navigator.clipboard.writeText()`
- [ ] **Show DevTools**: Use `@tauri-apps/api/webviewWindow.openDevtools()`
- [ ] **Show Debug Console**: Open debug window (Phase 5)

### Phase 5 – Debug Console Window & Logging Experience

#### 5.1 Multi-window support (Tauri)

- [ ] Implement `debug-console` window in Tauri
- [ ] Add `open_debug_console_window()` command
- [ ] Route `/debug` in `main.tsx` to `DebugConsole` component

#### 5.2 DebugConsole React UI

- [ ] Large scrolling text area for log lines
- [ ] Search input + **Find Next** button
- [ ] Highlight and scroll to occurrences
- [ ] Log sources: `yt-dlp-stderr`, `app-log` events
- [ ] Use Jotai `logEntriesAtom` for state

#### 5.3 Security & capabilities

- [ ] Ensure debug window has minimal necessary capabilities
- [ ] No unnecessary filesystem or shell access

### Phase 6 – Performance & Concurrency Improvements

#### 6.1 Concurrency control

- [ ] Add setting for max concurrent downloads
- [ ] Implement queue in Rust `DownloadManager`
- [ ] Spawn at most N concurrent yt-dlp processes
- [ ] Emit queue state events

#### 6.2 Frontend performance

- [ ] Implement virtual scrolling for large media lists
- [ ] Batch state updates for progress events
- [ ] Memoize heavy table cells and column definitions

### Phase 7 – Testing & Quality Gates

#### 7.1 Testing strategy

- [ ] Unit tests for Rust: filename module, progress parsing
- [ ] Unit tests for TS: settings mapping, log search
- [ ] Expanded E2E coverage:
  - Progress rendering
  - Thumbnails & placeholders
  - Context menu actions
  - Debug console functionality
- [ ] Platform checks on Windows, Linux, macOS

#### 7.2 Quality checklist

- [ ] All phases primary flows tested
- [ ] Filename collisions tested with synthetic cases
- [ ] No unhandled promise rejections
- [ ] No panics in Rust during error conditions

---

## 📋 **VERIFICATION CHECKLISTS**

### Phase 1 Verification

- [ ] Manual: Observe smooth progress on large video downloads
- [ ] E2E: Test progress UI reaction with injected events
- [ ] Manual: Try multiple sites for thumbnails/placeholders
- [ ] E2E: Test placeholder rendering with empty thumbnail events

### Phase 2 Verification

- [ ] Manual: Test long titles, non-ASCII characters, duplicate URLs
- [ ] Confirm: No silent overwrites, files visible in OS filesystem

### Phase 3 Verification

- [ ] Manual: Configure different modes/formats, verify file properties
- [ ] E2E: Test CLI flag composition with debug mode logging

### Phase 4 Verification

- [ ] Manual: Right-click list, trigger each action
- [ ] E2E: Test remove/copy/show window actions

### Phase 5 Verification

- [ ] Manual: Trigger downloads/cancellations, verify log display/search
- [ ] E2E: Simulate log events and confirm display/search

---

*Last updated: Based on analysis of specs/app-improvements.md and git history as of Nov 19, 2025*
