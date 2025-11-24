# Core Directives for AI Agents

## 1. Read Project Guidelines First

- **Read-project-docs**: Before code changes, read the main project docs (architecture, patterns, lessons learned).
- **Follow-existing-patterns**: Prefer existing abstractions and conventions over inventing new ones.

## 2. Think Before Acting ("Ultrathink")

- **Analyze-request**: Clarify the real goal, fit into existing architecture, and related features.
- **Design-first**:
  - Define contracts (inputs/outputs/errors).
  - Decide what is configurable vs. hardcoded.
  - Separate persistent state from transient UI/state.
  - Place logic in the right layer (domain/service/orchestrator vs. UI).
  - Plan how it will be tested.

## 3. TDD: Red–Green–Refactor

- **Red**: Write failing tests first.
  - Start with happy path, then validation, edge cases, error conditions.
  - Mock external dependencies (network, DB, FS, OS, external services).
- **Green**: Implement minimal code to make tests pass.
  - Only implement behavior covered by tests.
- **Refactor**: Improve structure without changing behavior.
  - Extract helpers, clean naming, remove duplication.
  - Keep tests passing.

Test style:
- Use descriptive names (what + when + expected).
- Use Arrange–Act–Assert structure.
- Prefer tests focused on one behavior; avoid "mega tests".
- When tests can't run in the current environment, still write or document them and focus on testable logic.

## 4. Architecture Principles

- **Never**:
  - Hardcode timeouts/retries/limits when they should be configurable.
  - Hide core business logic in UI components.
  - Call UI dialogs/notifications from deep core logic; keep a clear boundary.
  - Store critical state only in UI-level objects.
  - Swallow exceptions silently; always log or propagate appropriately.
  - Duplicate validation logic across layers.

- **Always**:
  - Separate concerns: UI, orchestration, domain logic, infrastructure.
  - Define interfaces/contracts for significant services/components.
  - Validate inputs at boundaries/orchestrators.
  - Log errors with enough context to debug.
  - Return explicit result objects/status values for operations.
  - Use async/non-blocking I/O where supported.

## 5. Adding a New Feature

1. **Explore**: Search for similar features, services, and patterns; read "lessons learned".
2. **Design**: Define contracts, configuration, state boundaries, and placement.
3. **Test-first**: Add failing tests for contract, validation, and errors.
4. **Implement**: Minimal code to pass tests; reuse existing patterns.
5. **Refactor**: Clean up, extract helpers, document public APIs.
6. **Integrate**: Wire into existing flows/UI; perform basic manual tests.
7. **Document & Commit**: Update docs if needed; commit small, focused changes with clear messages.

## 6. Fixing Bugs

1. **Reproduce**: Clarify expected vs. actual behavior and reproduction steps.
2. **Locate**: Trace code paths and logs; search for similar issues.
3. **Fix**: Address the root cause (validation, logic, or orchestration), not just symptoms.
4. **Prevent**: Add/extend tests, improve logging, document subtle gotchas.

## 7. Refactoring

1. **Justify**: Only refactor for real issues (duplication, violations, poor testability/maintainability).
2. **Plan**: Define target design, needed interfaces/contracts, and migration path.
3. **Execute**: Refactor incrementally; keep the system running at each step.
4. **Verify**: Run tests, check wiring/integration, and verify critical flows still work.

## Project Overview

ReMedia is a Tauri-based desktop media downloader that uses yt-dlp to extract and download media from URLs. It features a React/TypeScript frontend with shadcn/ui components and a Rust backend.

## Development Commands

### Building and Development

- `bun run dev` - Start frontend dev server (port 1420)
- `bun tauri dev` - Start full Tauri development with hot reload
- `bun run build` - Build frontend for production
- `bun tauri build` - Build complete application

### Code Quality

- `bun run lint` - Run oxlint linter (TypeScript-aware)
- `bun run lint:fix` - Fix linting issues automatically
- `bun run fmt` - Format code with oxfmt
- Before marking work complete, run format+lint and full builds for both UIs: `bun run fmt`, `bun run lint`, `bun run build`, `bun tauri build` to catch warnings/errors.

### Testing

- `bun run test:e2e` - Run Playwright end-to-end tests
- `bun run test:e2e:web` - Run web-only Playwright tests
- `bun run test:e2e:headed` - Run Playwright tests with headed browser
- `bun run test:e2e:install` - Install Playwright browsers and dependencies

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

### TypeScript Configuration

- Strict mode enabled with `noUncheckedIndexedAccess`
- Path aliases: `@/*` maps to `./src/*`
- ES2020 target with DOM libraries
- No unused locals/parameters allowed

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
- Playwright for end-to-end testing with cross-platform support
