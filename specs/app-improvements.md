---
description: Multi-phase improvement plan for ReMedia (Tauri + React + yt-dlp)
---

# ReMedia Improvement Plan

## 1. Overview & Goals

ReMedia is a cross-platform desktop media downloader built with:

- **Frontend**: React 19 + TypeScript, shadcn/ui, Tailwind, TanStack Table, Jotai
- **Backend**: Rust + Tauri 2, official Tauri plugins
- **Engine**: yt-dlp for metadata extraction and downloads

**Primary user**: "Download everything" power users who want:

- A **super-simple default flow**: paste/drag URL → download best quality video or **audio-only**.
- **Advanced controls in Settings** for quality, max resolution, formats, and future power features.

**Primary focus areas (in order)**:

1. **UX & workflows**
2. **New features (power-user oriented)**
3. **Reliability & robustness**
4. **Performance & concurrency**

Platforms (priority): **Windows → Linux (X11/Wayland) → macOS**.

---

## 2. Project Orientation for Autonomous Agents

### 2.1. Repository Structure (high-level)

- `src/`
  - `App.tsx` – Main window: URL ingestion, list view, download orchestration, Settings & Preview entrypoints.
  - `player.tsx` – Preview player window (`/player` route) using `react-player`.
  - `main.tsx` – Entry; routes to `App` vs `Player` based on `window.location.pathname`.
  - `components/`
    - `data-table.tsx` – Wrapper around **TanStack Table v8** for the media list.
    - `drop-zone.tsx` – Drag-and-drop URL handler.
    - `settings-dialog.tsx` – Settings dialog using shadcn/ui `Dialog` and Jotai atoms.
    - `ui/` – shadcn/ui primitives (button, dialog, table, etc.).
  - `hooks/`
    - `useTauriEvent.ts` – Tauri event subscription helper with E2E-friendly injection.
    - `use-window-focus.ts` – Runs callbacks on focus.
  - `state/`
    - `app-atoms.ts` – `tableRowSelectionAtom` for list selection.
    - `settings-atoms.ts` – persistent settings via `atomWithStorage` (download location, always-on-top flag).
  - `types/`
    - `index.ts` – Shared TS types for Tauri events and command payloads.

- `src-tauri/`
  - `src/lib.rs` – Tauri builder: plugins, single-instance, invoke handler registration.
  - `src/downloader.rs` – yt-dlp integration for `get_media_info` and `download_media`.
  - `src/remedia.rs` – App-level commands (`quit`, `set_always_on_top`, `is_wayland`, `open_preview_window`).
  - `helpers/` – Platform-specific yt-dlp binaries (per docs).

- `docs/architecture.md` – High-level architecture, IPC flow, testing strategy.
- `README.md` – Dev commands, platform support, high-level features.

### 2.2. Core Data & Event Flow

- **Frontend → Backend (commands via `invoke`)**
  - `get_media_info(mediaIdx, mediaSourceUrl)` → yt-dlp `-j` JSON metadata.
  - `download_media(mediaIdx, mediaSourceUrl, outputLocation)` → yt-dlp download with progress template.
  - `set_always_on_top(alwaysOnTop)` → adjusts window behavior.
  - `is_wayland()` → platform detection (Wayland vs others).
  - `quit()` → application exit.

- **Backend → Frontend (events via `emit`)**
  - `"update-media-info"` – `(media_idx, url, title, thumbnail)`.
  - `"download-progress"` – `(media_idx, percent)`.
  - `"download-complete"` – `media_idx`.
  - `"download-error"` – `media_idx`.
  - `"yt-dlp-stderr"` – `(media_idx, line)`; currently emitted but unused in frontend.

- **Event handling in frontend**
  - Centralized through `useTauriEvents` hook:
    - Registers `listen` handlers from `@tauri-apps/api/event`.
    - Supports test-only event injection via `window.__E2E_emitTauriEvent`.

### 2.3. Key Libraries & Where to Read

- **Tauri 2**
  - Plugins & capabilities: <https://v2.tauri.app/plugin/>
  - Multi-window & window capabilities: <https://v2.tauri.app/learn/security/capabilities-for-windows-and-platforms/>
  - Official plugins workspace: <https://github.com/tauri-apps/plugins-workspace>

- **yt-dlp**
  - Main README: <https://raw.githubusercontent.com/yt-dlp/yt-dlp/master/README.md>
  - Focus sections for this project:
    - **OUTPUT TEMPLATE** (`--output`, naming): positions ~28–32.
    - **FORMAT SELECTION** (`-f`, `--audio-format`, `--remux-video`): positions ~33–37.
    - **FILESYSTEM OPTIONS** (`--windows-filenames`, `--no-overwrites`): positions ~17–18.
    - **DOWNLOAD OPTIONS** (concurrency, rate limiting): positions ~15–16.

- **Jotai**
  - Storage utilities (`atomWithStorage`): <https://jotai.org/docs/utilities/storage>
  - Persistence guide: <https://jotai.org/docs/guides/persistence>

- **TanStack Table v8**
  - React row selection example: <https://tanstack.com/table/v8/docs/framework/react/examples/row-selection>
  - Row Selection guide & APIs: <https://tanstack.com/table/v8/docs/guide/row-selection>

- **shadcn/ui**
  - Context Menu: <https://ui.shadcn.com/docs/components/context-menu>
  - Dropdown Menu (already used): <https://ui.shadcn.com/docs/components/dropdown-menu>

---

## 3. Known Issues & Desired Features (from user brief)

- **Progress behavior**
  - Progress often jumps 0 → 99 → 100 or 0 → 100, not smooth.
  - Root cause hypotheses:
    - Current template uses bytes + estimated totals; early `t_bytes` values are 0, so progress is not emitted until late.
    - yt-dlp prints progress less frequently than expected depending on format; template may be too coarse.

- **Thumbnails**
  - Need more **reliable thumbnail retrieval** for video URLs.
  - If yt-dlp can't provide a thumbnail, we need a **placeholder image** instead of an empty cell.

- **Context menu on media list**
  - Required menu items:
    - Download all
    - Cancel all
    - Remove selected
    - Remove all
    - Copy all URLs
    - Show DevTools
    - Show Debug Console
  - All items must be implemented end-to-end.

- **Debug Console window**
  - New Tauri window dedicated to logs and diagnostics:
    - Text area showing `stdout`, `stderr` from yt-dlp and additional app logs.
    - Single-line text input with **"Find Next"** to search within the log.
    - Accessible from list context menu and perhaps a keyboard shortcut.

- **Settings dialog**
  - Remove placeholder fields (`Name`, `Username`).
  - Add **advanced settings**:
    - Download quality presets.
    - Max video resolution.
    - Output **video format**.
    - Output **audio-only format**.
    - Audio quality setting.
    - (Future: SponsorBlock, download concurrency, etc.).

- **Filename safety & uniqueness**
  - Filenames must be **sanitized** and safe across platforms (esp. Windows).
  - Enforce reasonable **length limits**.
  - Ensure **no collisions**:
    - Two different URLs should never silently overwrite each other's output.
    - If the natural filename would collide, derive a unique variant (e.g. include `id` or a short hash).

---

## 4. Guiding Principles

1. **MVP-first but power-user-friendly**
   - Keep the default path extremely simple.
   - Hide complexity in Settings and advanced menus.

2. **Backend correctness over frontend cosmetics**
   - Prefer leveraging yt-dlp capabilities (format selection, naming, archive, etc.) over ad hoc parsing.

3. **Event-driven, observable behavior**
   - All non-trivial actions (downloads, cancellations, errors) should emit events.
   - The Debug Console should show these events in a user-friendly way.

4. **Cross-platform, Windows-first**
   - Lean on `--windows-filenames` and Tauri's filesystem APIs.
   - Avoid platform-specific hacks where possible; where needed, isolate in Rust.

5. **Testable milestones**
   - Each phase ends with observable behavior and at least one E2E test or clear manual test plan.

---

## 5. Phases & Milestones

### Phase 0 – Baseline & Instrumentation

**Goal**: Establish a reliable baseline for behavior and logging, without changing core features.

**Key tasks**

- **0.1** Confirm build & test health
  - Run: `bun run dev`, `bun tauri dev`, `bun run check`, `bun run test:e2e:web`.
  - Document any flaky tests or platform-specific issues.

- **0.2** Expand dev logging
  - Ensure `yt-dlp` stderr is clearly visible in dev logs (already partially done via `println!` and `yt-dlp-stderr` events).
  - Add a simple log aggregator in the frontend (e.g., an atom storing last N log entries) to prepare for Debug Console.

- **0.3** Capture current UX with screenshots/video
  - Record a short run of core workflow: drag URL → metadata → download → preview.

**Verification**

- All commands (`bun tauri dev`, `bun run check`, `bun run test:e2e:web`) succeed on at least one primary platform.
- Confirm that `yt-dlp-stderr` events are emitted and can be observed via a temporary debug log view (even if not yet a full console window).

---

### Phase 1 – Robust Progress & Metadata (Thumbnails)

**Goal**: Make progress updates smooth and reliable, and ensure thumbnails are always either real or gracefully degraded.

#### 1.1 Progress fixes

**Backend changes (`downloader.rs`)**

- Revisit yt-dlp progress template usage (see README **OUTPUT TEMPLATE** and **DOWNLOAD OPTIONS**):
  - Current template: `download:remedia-%(progress.downloaded_bytes)s-%(progress.total_bytes)s-%(progress.total_bytes_estimate)s-%(progress.eta)s`.
  - Problem: early in a download, `total_bytes` and `total_bytes_estimate` may be `0` or `nan`, causing the current implementation to skip emitting progress until late.

**Proposed approach**

- **Option A (recommended)**: use yt-dlp's built-in `_percent` field:
  - Template: `download:remedia-%(progress._percent_stripped)s-%(progress.eta)s-%(info.id)s`.
  - Parse `percent` directly as `f64`, avoiding manual math.

- **Option B**: keep bytes-based logic but be more permissive:
  - Use whichever of `total_bytes` or `total_bytes_estimate` is **first non-zero**.
  - Emit progress once total > 0, even if using estimated total initially.

**Frontend changes (`App.tsx`)**

- `handleProgress` currently clamps and directly sets `Downloading` status.
  - Optionally **debounce** or **smooth** progress updates (e.g., ignore regressions, clamp jumps > X% unless completion is imminent).
- Ensure the **global progress bar** is robust when `mediaList.length === 0` to avoid division by zero.

**Verification**

- Manual test: observe a longer download (large video) and confirm progress increments smoothly in small steps.
- E2E test: use Playwright with `__E2E_emitTauriEvent("download-progress", [idx, 5])` etc. to verify UI reaction.

#### 1.2 Thumbnail reliability & placeholders

**Backend (`get_media_info`)**

- Extend JSON parsing based on yt-dlp metadata schema:
  - Currently uses `thumbnail` only.
  - New strategy:
    - If `thumbnail` is non-empty → use it.
    - Else, if `thumbnails` is an array, pick the **highest-resolution** or last element.
    - Else, if `thumbnail_url` exists, use it.
    - Else, emit an empty string and let frontend show placeholder.

**Frontend (`App.tsx`, table column for `thumbnail`)**

- Add a **static placeholder image** (e.g. `src/assets/thumbnail-placeholder.svg`):
  - If `thumbnail` is falsy, render placeholder instead of an empty div.
- Consider a small visual indicator when a thumbnail is missing to hint at potential site limitations.

**Verification**

- Manual: Try multiple sites (YouTube, Vimeo, others) and verify thumbnails or placeholders.
- E2E: Add a test that injects a `MediaInfoEvent` with empty thumbnail and checks for placeholder rendering.

---

### Phase 2 – Filename Safety, Sanitization & Uniqueness

**Goal**: Ensure all downloads produce safe, non-colliding filenames across platforms.

#### 2.1 Output template design (yt-dlp)

- Leverage yt-dlp's **OUTPUT TEMPLATE** (README positions ~28–32):
  - Recommended template baseline:
    - `%(title)s [%(id)s].%(ext)s`
  - This already greatly reduces collision risk (id is unique per video on a platform).

- Additional safety for playlists and duplicates:
  - Append playlist index when applicable: `%(title)s [%(id)s] [%(playlist_index)s].%(ext)s`.
  - Use `--windows-filenames` (already present) to make names Windows-safe.

- Add configuration flags for more aggressive sanitization:
  - Optional `--restrict-filenames` when user wants **ASCII-only** filenames.

#### 2.2 Collision & length handling (Rust helper)

- Introduce a dedicated **filename module** (e.g. `src-tauri/src/filename.rs`):
  - Public responsibilities:
    - Normalize and truncate filenames to a safe length per platform.
    - If a file path already exists for a download, derive a variant (e.g. append `[2]`, `[3]`, or a short hash).
  - Implementation outline:
    - Accept `base_dir`, `template_result` (from yt-dlp), and `url` or `id`.
    - Use `PathBuf` and `tauri_plugin_fs` when appropriate for safer path handling.
    - Check existence before finalizing the path; adjust if necessary.

- Optionally coordinate with yt-dlp's **filesystem options**:
  - `--no-overwrites` to prevent accidental overwrites.
  - A future advanced option for `--download-archive` to skip re-downloads, if desired.

#### 2.3 Settings surface for naming

- In advanced settings, expose a **simple toggle** for filename strategy:
  - Default: `"Title [ID].ext"` (safe and unique).
  - Advanced: `"Title.ext"` (only if user understands collision risks).

**Verification**

- Manual tests on Windows, Linux, macOS with:
  - Very long titles.
  - Non-ASCII characters.
  - Multiple URLs pointing to the same video.
- Confirm:
  - No silent overwrites.
  - Files are visible and correctly named in the OS filesystem.

---

### Phase 3 – Advanced Download Settings (Quality, Resolution, Formats)

**Goal**: Allow power users to configure download quality, resolution, and formats while defaulting to "best available".

#### 3.1 Settings model (Jotai atoms)

- Extend `src/state/settings-atoms.ts` using `atomWithStorage` from Jotai Storage docs:
  - `downloadModeAtom`: `'video' | 'audio' | 'both'` (default `'video'`).
  - `videoQualityAtom`: e.g. `'best' | 'high' | 'medium' | 'low'`.
  - `maxResolutionAtom`: e.g. `'2160p' | '1440p' | '1080p' | '720p' | '480p' | 'no-limit'`.
  - `videoFormatAtom`: e.g. `'mp4' | 'mkv' | 'webm' | 'best'`.
  - `audioFormatAtom`: e.g. `'mp3' | 'm4a' | 'opus' | 'best'`.
  - `audioQualityAtom`: e.g. `'best' | 'high' | 'medium' | 'low'` mapped to yt-dlp `--audio-quality` values.
  - Future toggles: SponsorBlock removal, download concurrency limit, etc.

#### 3.2 Settings dialog UI (shadcn/ui)

- Replace placeholder fields (`Name`, `Username`) with advanced settings sections:
  - **Download mode & quality**
    - Radio or select for mode (Video/Audio only).
    - Select for quality preset.
  - **Video options**
    - Select for max resolution.
    - Select for output format.
  - **Audio-only options**
    - Select for output format.
    - Select for audio quality.

- Use shadcn/ui primitives (Select, Label, etc.) for consistent UI.

#### 3.3 Wiring settings to yt-dlp CLI

- In `download_media` (Rust):
  - Read effective settings via command payload (extend TS command types and `invoke` calls to include settings snapshot), or via separate command to fetch settings from frontend.
  - Translate settings to yt-dlp options based on README **FORMAT SELECTION** and **POST-PROCESSING OPTIONS**:

    - **Video format & resolution**
      - Use `-f` expressions such as `bestvideo[height<=1080]+bestaudio/best[height<=1080]`.
      - Use `--remux-video` for container changes when needed.

    - **Audio-only mode**
      - Use `-f bestaudio` with `--extract-audio` and `--audio-format`.
      - Use `--audio-quality` for quality presets (e.g. 0=best, 9=worst).

- Keep a **simple default path**:
  - If user has never touched advanced settings, behave like current implementation (best available).

**Verification**

- Manual: configure different modes and formats, and verify resulting file properties (format, resolution, bitrate where possible).
- E2E: add tests that mock settings atoms (or inject via `__E2E_addUrl` and a test-only settings override) and verify the correct CLI flag composition in Rust (using a debug mode that logs the command string).

---

### Phase 4 – Media List Context Menu & Bulk Operations

**Goal**: Provide a rich context menu on the list view to perform bulk actions efficiently.

#### 4.1 UI implementation (shadcn Context Menu + TanStack Table)

- Wrap the `DataTable` or its rows with `ContextMenu` from shadcn/ui:
  - Use `ContextMenuTrigger` on the list container or rows.
  - `ContextMenuContent` contains the required actions:
    - Download all
    - Cancel all
    - Remove selected
    - Remove all
    - Copy all URLs
    - Show DevTools
    - Show Debug Console

- Ensure compatibility with existing **row selection** (TanStack Table):
  - `Remove selected` should respect `tableRowSelectionAtom`.

#### 4.2 Action semantics & backend support

- **Download all**
  - Triggers `startDownload` for all or all selected entries.
  - Optionally add a variant: `Download selected` if selection is non-empty.

- **Cancel all**
  - Requires new cancellation support in backend:
    - Introduce a `DownloadManager` structure in Rust (e.g. `src-tauri/src/download_manager.rs`) that tracks spawned yt-dlp `Child` processes by `media_idx`.
    - New Tauri commands:
      - `cancel_download(media_idx)`
      - `cancel_all_downloads()`
    - On cancellation:
      - Kill the process.
      - Emit an event, e.g. `"download-cancelled"` with `media_idx`.

- **Remove selected / Remove all**
  - Pure frontend operations on `mediaList` state.

- **Copy all URLs**
  - Use `navigator.clipboard.writeText()` with newline-separated URLs.
  - Optionally show a notification using Tauri notification plugin.

- **Show DevTools**
  - Use `@tauri-apps/api/webviewWindow` to get the main window and call `.openDevtools()`.
  - On platforms where this is restricted, handle errors gracefully.

- **Show Debug Console**
  - Opens (or focuses) the Debug Console window (see Phase 5).

**Verification**

- Manual: Right-click in the list, trigger each action, ensure it behaves as expected.
- E2E: At minimum, tests for `Remove selected`, `Remove all`, and `Copy all URLs` (backend-free); later extend to cancellation once implemented.

---

### Phase 5 – Debug Console Window & Logging Experience

**Goal**: Provide a dedicated, user-visible log console for troubleshooting downloads and backend behavior.

#### 5.1 Multi-window support (Tauri)

- Follow Tauri multi-window and capability docs:
  - <https://v2.tauri.app/learn/security/capabilities-for-windows-and-platforms/>

- Implement a `debug-console` window:
  - Backend command `open_debug_console_window(app: AppHandle, ...)` similar to `open_preview_window`.
  - Route: e.g. `/debug` in `main.tsx` to render a `DebugConsole` React component.

#### 5.2 DebugConsole React UI

- Component responsibilities:
  - Large scrolling text area (or virtualized list) showing log lines.
  - Search input + **Find Next** button:
    - Maintain search state and current index in logs.
    - Highlight or scroll to the next occurrence.

- Log content sources:
  - `yt-dlp-stderr` events.
  - Optional "app log" events emitted from Rust or frontend (e.g. `"app-log"` with level, message, context).

- State management:
  - Use a Jotai atom for `logEntriesAtom` (array with timestamp, source, level, message).
  - Hooks:
    - `useTauriEvents` subscriptions for `"yt-dlp-stderr"` and `"app-log"`.

#### 5.3 Security & capabilities

- Ensure the debug window has only the capabilities it needs (per Tauri docs):
  - No unnecessary filesystem or shell access beyond what is needed to display logs.

**Verification**

- Manual: Trigger downloads and cancellations; verify log lines appear and search works.
- E2E: Simulate log events via `__E2E_emitTauriEvent("yt-dlp-stderr", ...)` and confirm display + search.

---

### Phase 6 – Performance & Concurrency Improvements

**Goal**: Ensure responsive UI and controlled concurrency when downloading many items.

#### 6.1 Concurrency control

- Add a setting (advanced) for **max concurrent downloads**.
- In Rust `DownloadManager`, enforce a limit:
  - Maintain a queue of requested downloads.
  - Spawn at most `N` concurrent yt-dlp processes.
  - When a download completes/cancels/errors, start the next queued item.

- Emit events for queue state (e.g. `"download-queued"`, `"download-started"`).

#### 6.2 Frontend performance

- Consider virtualizing the media list once it can grow large:
  - Replace table body rendering with a virtual-list implementation when row count exceeds a threshold.

- Batch state updates:
  - Ensure progress updates do not cause excessive re-renders (Jotai already helps; avoid unnecessary derived state where possible).

**Verification**

- Manual: Add 50–100 URLs and observe responsiveness.
- Profiling: Use browser dev tools and Tauri dev tools to check render times during heavy progress events.

---

### Phase 7 – Testing & Quality Gates

**Goal**: Ensure each new feature is covered by tests or a clear manual test plan.

#### 7.1 Testing strategy

- **Unit-level** (where practical):
  - Rust: filename module, progress parsing, command composition.
  - TS: settings mapping functions (settings → yt-dlp flags), log search algorithm.

- **E2E (Playwright)**:
  - Progress rendering (using injected events).
  - Thumbnails & placeholders.
  - Context menu actions (remove/copy/show windows).
  - Debug console log display and search.

- **Platform checks**:
  - At least smoke tests on Windows, Linux (X11 & Wayland), macOS.

#### 7.2 Quality checklist before release

- ✅ All phases’ primary flows tested.
- ✅ Filename collisions tested with synthetic cases.
- ✅ No unhandled promise rejections in frontend.
- ✅ No panics in Rust during typical error conditions.

---

## 6. Implementation Order (Roadmap Summary)

1. **Phase 0–1**: Stabilize progress updates and thumbnails; ensure basic logging and placeholders.
2. **Phase 2**: Implement robust filename handling and collision prevention.
3. **Phase 3**: Add advanced Settings knobs and wire them to yt-dlp.
4. **Phase 4**: Add list context menu and bulk actions; start wiring cancellation.
5. **Phase 5**: Build Debug Console window and refine logging pipeline.
6. **Phase 6**: Add concurrency control and performance optimizations.
7. **Phase 7**: Strengthen tests and finalize cross-platform checks.

This plan is designed so that an autonomous coding agent can pick up any phase, consult the referenced documentation, and implement changes while preserving ReMedia's simple default UX and expanding power-user capabilities over time.
