# Improvement Tasks Checklist

Note: Each item is actionable and starts with a checkbox placeholder. Work through the items in order for best results.

1. [ ] Establish project-wide goals and baseline
   - [ ] Review current product scope and define non-functional requirements (performance, reliability, offline support, platform targets). 
   - [ ] Document supported OS targets for Tauri (Windows, macOS, Linux, Android) and minimum versions.
   - [ ] Create a high-level architecture diagram (React UI, Jotai state, Tauri commands/events, yt-dlp process) in docs/architecture.md.

2. [ ] Developer experience and consistency
   - [ ] Add a single "all checks" script (e.g., bun run ci) to run typecheck, lint, format, build, and tests.
   - [ ] Ensure Biome config covers formatting + linting for TS/TSX, JSON, CSS. Align ESLint rules or remove ESLint if redundant with Biome.
   - [ ] Add pre-commit hooks (e.g., lefthook or simple husky+bun) for format, lint, typecheck.
   - [ ] Enable EditorConfig and recommended IDE settings (JetBrains VS Code) in docs/dev-setup.md.

3. [x] TypeScript strictness and typing
   - [x] Enable/verify strict TypeScript options in tsconfig (strict, noUncheckedIndexedAccess, exactOptionalPropertyTypes, noImplicitOverride, etc.).
   - [x] Add explicit types for complex React state (e.g., VideoInfo in App.tsx) and function signatures where inferred types may drift.
   - [x] Create dedicated types module for shared payloads between Rust and TS (events and commands), and centralize in src/types.

4. [ ] Frontend architecture and state management
   - [ ] Extract App.tsx responsibilities into feature modules (ingestion, queue, downloads, settings) to reduce file size and improve cohesion.
   - [ ] Replace ad-hoc local state with Jotai atoms/selectors where shared across components; keep ephemeral UI state local.
   - [ ] Introduce a small “services” layer for IPC (invoke/send/receive) with typed wrappers and error normalization.
   - [ ] Add react-virtualized/virtualizer for the data table to support large queues without performance issues.
   - [ ] Introduce feature-based folder structure under src/features/* with index files exporting public surface.

5. [ ] UI/UX and accessibility
   - [ ] Audit all interactive elements for keyboard accessibility (tab order, focus ring, ARIA labels, role semantics).
   - [ ] Ensure DropZone supports keyboard paste and a visible focusable target, with descriptive aria-live messages on state changes.
   - [ ] Provide toasts/sonner for success/error, replacing console logs for user-visible outcomes.
   - [ ] Implement dark/light system preference sync and persist theme (next-themes usage review).
   - [ ] Add consistent loading and disabled states on long-running actions (global and per-row).

6. [ ] IPC, events, and error handling
   - [ ] Centralize Tauri event names/constants and payload schemas shared by Rust and TS.
   - [ ] Expand useTauriEvents to validate payload shape at runtime (zod) and log structured errors.
   - [ ] Introduce a retry/backoff strategy for transient invoke failures and show actionable user messages.
   - [ ] Add global error boundary in React and a fallback UI.
   - [ ] Surface permission prompts (e.g., notifications, clipboard) proactively with clear states.

7. [ ] Downloader and process management (Rust)
   - [ ] Ensure yt-dlp invocation is non-blocking and robust: read stdout/stderr asynchronously, stream progress, avoid deadlocks.
   - [ ] Sanitize/validate command arguments to prevent injection vulnerabilities; never pass unsanitized user input to shell.
   - [ ] Use a structured error type (thiserror) and map errors to user-friendly codes/messages for the UI.
   - [ ] Add log instrumentation (tracing) with levels; pipe logs to Tauri DevTools in debug and to file in release.
   - [ ] Implement cancellation support per download (track process handles, kill safely on user request).
   - [ ] Add output path validation and atomic writes; ensure cross-platform path handling (Windows reserved names, etc.).

8. [ ] Event contracts and progress semantics
   - [ ] Define and document event payloads (MediaInfoEvent, MediaProgressEvent, completion, error) with versioned schemas.
   - [ ] Emit a final terminal event for each download (success or failure) with summary metadata.
   - [ ] Ensure event ordering guarantees (monotonic progress per id) and include correlation ids across events.

9. [ ] Settings and persistence
   - [ ] Validate and normalize downloadLocation; default to OS downloadDir and verify write permissions.
   - [ ] Add migration support for settings (version key) using jotai/utils or a tiny migration utility.
   - [ ] Persist table selection and app window state (size, position, always-on-top) with opt-out and reset controls.

10. [ ] Performance and resource usage
   - [ ] Debounce/throttle clipboard polling or remove if unnecessary; prefer system events where available.
   - [ ] Batch state updates when processing frequent progress events to reduce React renders.
   - [ ] Memoize heavy table cells and column definitions; avoid inline lambdas where possible.
   - [ ] Lazy-load heavier components (settings dialog, preview window) and split vendor chunks in Vite.

11. [ ] Testing strategy
   - [ ] Add unit tests for IPC service layer and reducers/atoms behavior.
   - [ ] Expand Playwright e2e to cover: paste URL, drop URL, select audio-only, start, progress update, completion, error path.
   - [ ] Add mocked Tauri events in e2e via window.__E2E_emitTauriEvent to simulate backend.
   - [ ] Introduce snapshot/regression tests for key UI states (dark/light, compact mode).
   - [ ] Configure test artifacts retention and flaky test retry policy in playwright.config.ts.

12. [ ] Security and robustness
   - [ ] Validate all inbound URLs (protocol allowlist, length limits) before enqueueing downloads.
   - [ ] Restrict file system access via Tauri allowlist; verify only needed APIs are enabled.
   - [ ] Implement safe temp directory usage and cleanup for intermediate files.
   - [ ] Add integrity checks on downloaded files where feasible (size, hash if available).

13. [ ] Cross-platform and packaging (Tauri)
   - [ ] Verify builder configs for Windows/macOS/Linux signing, icons, and metadata.
   - [ ] Handle Wayland/X11 nuances (is_wayland already present) and test window features accordingly.
   - [ ] Add Android-specific constraints behind cfg gates to avoid no-op mismatches.
   - [ ] Provide packaging docs and scripts for release channels (alpha/beta/stable) and update flows.

14. [ ] Observability
   - [ ] Add a minimal telemetry toggle (opt-in) and local logging viewer panel for troubleshooting.
   - [ ] Provide a diagnostics bundle command (zipped logs, config, last-run.json) for bug reports.

15. [ ] Documentation and examples
   - [ ] Create docs/architecture.md and docs/ipc-contracts.md describing event schemas and commands.
   - [ ] Document development workflow, running e2e locally (web-only and tauri), and common pitfalls.
   - [ ] Add code-level comments for complex Rust parts (yt-dlp parsing, event emission) and React hooks.

16. [ ] Code quality cleanup
   - [ ] Remove dead code, commented blocks, and console.log in production; gate with debug assertions.
   - [ ] Normalize file names and paths (index.ts re-exports, absolute imports with @ alias consistency).
   - [ ] Ensure CSS variables and Tailwind tokens are documented; remove unused custom properties.

17. [ ] Feature enhancements (optional roadmap)
   - [ ] Multi-download concurrency controls with queue limits and priorities.
   - [ ] Clip selection or format selection before download (quality, audio codec).
   - [ ] Subtitles download/extraction toggle and merge options.
   - [ ] Preview player in a detachable window (uses open_preview_window) with safe navigation.

18. [ ] Release readiness
   - [ ] Add versioning strategy and changelog (Keep a Changelog) with conventional commits.
   - [ ] Smoke test matrix on CI for Windows/macOS/Linux using tauri-action.
   - [ ] Prepare privacy policy and third-party licenses list.
