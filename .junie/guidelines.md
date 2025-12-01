# Remedia – Development Guidelines (project‑specific)

## Build and configuration

- Tooling overview
  - Frontend: React + Vite + TypeScript, managed via Bun. Scripts live in `package.json`.
  - Desktop shell: Tauri v2 (Rust 2024 edition) under `src-tauri/`.
  - Lint/format: `oxlint` and `oxfmt` with type awareness; Tailwind v4 via `@tailwindcss/vite`.

- Prerequisites (Windows)
  - Bun installed and in PATH (`bun --version`).
  - Rust toolchain via rustup; stable channel works with this repo. `cargo --version` should succeed.
  - Tauri prerequisites for Windows (C++ Build Tools, WebView2) per <https://tauri.app> → follow the official checklist if you haven’t built Tauri apps on this machine before.

- Dev workflow (web)
  - Start Vite: `bun run dev`
  - Preview prod build locally: `bun run preview`

- Dev workflow (Tauri desktop)
  - Use the CLI exposed as `tauri` script:
    - Dev: `bun run tauri dev`
    - Build installer/bundle: `bun run tauri build`
  - The Rust side manifest is `src-tauri/Cargo.toml`. Release LTO is enabled and panics are set to `abort` (see `[profile.release]`).

- Build (web)
  - Type-check + build: `bun run build` (runs `tsc && vite build`).

- Configuration bits that matter
  - Cargo features include `remote-e2e` for websocket remote-control integration tests. See `src-tauri/Cargo.toml` `[features]`.
  - `package.json` scripts use environment variables:
    - `PW_WEB_ONLY=1` for Playwright to run against the web build: `bun run test:e2e:web`.
    - `CARGO_TARGET_DIR=target-remote` in `test:remote:cargo` to isolate artifacts.
  - Tauri plugins used include clipboard, dialog, fs, notification, opener, updater; Windows/macOS/Linux gates are configured in `Cargo.toml` and `tauri.conf.json`.

## Rust backend (src-tauri) — structure and conventions

- Crate layout
  - Entry: `src-tauri/src/lib.rs` builds the Tauri `Builder`, registers plugins, sets up remote harness (see `ENABLE_REMOTE_HARNESS`), and exposes commands via `tauri::generate_handler!`.
  - Major modules:
    - `downloader.rs` — core logic: parse media info, expand playlists, queue, spawn `yt-dlp` processes, progress parsing, settings validation. Contains extensive unit tests.
    - `remote_control.rs` — websocket bridge for a remote harness (Tokio + tungstenite), feature‑gated scenarios via env; plenty of unit tests for protocol shape.
    - `remedia.rs` — small Tauri commands (quit, `set_always_on_top`, `is_wayland`, `open_preview_window`).
    - `download_queue.rs`, `redgifs.rs`, `thumbnail.rs`, `events.rs`, `logging.rs` — focused helpers/utilities.
  - Feature flags and profiles: see `src-tauri/Cargo.toml`.
    - `remote-e2e` feature toggles websocket/integration behavior for tests.
    - `[profile.release]` uses `lto = true`, `panic = "abort"`, `opt-level = "s"` for small binaries.

- Tauri command surface
  - Use `#[tauri::command]` on async or sync fns. Prefer the pattern seen in `remedia.rs` and `downloader.rs`:
    - Accept `AppHandle` or `Window` when you need to emit events or access windows.
    - Return `Result<T, String>` (map errors with `.map_err(|e| e.to_string())?`) to simplify bridging to JS.
  - Register new commands in `lib.rs` `generate_handler![...]` list.

- Async and runtime
  - Tokio is enabled with features: `process`, `io-util`, `macros`, `time`. Prefer `async fn` for IO‑bound operations; spawn blocking work appropriately.
  - HTTP via `reqwest` compiled with `rustls-tls` (no OpenSSL dep).
  - WebSockets via `tokio-tungstenite` (see `remote_control.rs`).

- Remote harness
  - Controlled by env `ENABLE_REMOTE_HARNESS` (set to `1` to enable). In debug builds it defaults to on; in release it’s off unless the env var is set. See `lib.rs` `setup` block.
  - For CI or local integration, prefer the npm script `test:remote:cargo` which enables the `remote-e2e` feature.

- Error handling & logging
  - Favor early `return Err(String)` for user‑visible errors. Use `eprintln!` for low‑level diagnostics and `Window::emit` for UI‑consumable events (see downloader helpers).
  - Keep parsing/validation helpers pure and unit‑tested (pattern already used in `downloader.rs`).

- Formatting and lints (Rust)
  - Format: `cargo fmt --manifest-path src-tauri/Cargo.toml`
  - Lint: `cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings` (optional but recommended locally).

## Testing

- Unit/component tests (frontend, Bun test)
  - Run all: `bun run test`
  - Watch: `bun run test:watch`
  - Coverage: `bun run test:coverage`
  - The runtime is `bun:test` with `happy-dom` configured (see devDependencies). Testing Library utilities are available:
    - `@testing-library/react`, `@testing-library/user-event`, `@testing-library/jest-dom`.
  - File naming: Bun discovers `*.test.*` / `*.spec.*` in `src/` and `test/` by default.

- End-to-end tests
  - Playwright:
    - Install browsers: `bun run test:e2e:install`
    - Run headless: `bun run test:e2e`
    - Run headed: `bun run test:e2e:headed`
    - Web-only against `vite`/`preview`: `bun run test:e2e:web` (uses `PW_WEB_ONLY=1`).
  - WebdriverIO scaffolding exists (`wdio` script). Prefer Playwright unless a specific WDIO test is referenced.

- Rust tests (src-tauri)
  - All tests from the Rust side: `cargo test --manifest-path src-tauri/Cargo.toml`
  - Remote integration tests that depend on websocket features:
    - `bun run test:remote:cargo`
      - Internally: `cmd /C "set CARGO_TARGET_DIR=target-remote&& cargo test --manifest-path src-tauri/Cargo.toml --features remote-e2e --tests"`
  - Run a single test or module (examples):
    - By name: `cargo test --manifest-path src-tauri/Cargo.toml test_build_remote_hello_structure`
    - In one file (filter): `cargo test --manifest-path src-tauri/Cargo.toml downloader -- --nocapture`

- How to add a new test (frontend)
  - Create `*.test.ts[x]` under `test/` or near the code in `src/`. Example skeleton:
    ```ts
    import { describe, it, expect } from "bun:test";

    describe("math", () => {
      it("adds", () => {
        const add = (a: number, b: number) => a + b;
        expect(add(1, 2)).toBe(3);
      });
    });
    ```
  - Run just that file: `bun test test\my-file.test.ts`

- How to add a new test (Rust)
  - Inside any `src-tauri/src/*.rs`, add a `#[cfg(test)] mod tests { … }` module with `#[test]` functions. If the test needs the websocket remote control, gate it behind the `remote-e2e` feature and run via the `test:remote:cargo` script.
  - For integration tests, create files under `src-tauri/tests/*.rs`. These compile as separate crates and can call `remedia_lib` public APIs. Example skeleton:
    ```rust
    // src-tauri/tests/sample_smoke.rs
    #[test]
    fn adds_numbers() {
        assert_eq!(2 + 3, 5);
    }
    ```
  - Async tests use Tokio:
    ```rust
    #[tokio::test]
    async fn fetches() {
        let body = "ok"; // imagine an async call
        assert_eq!(body, "ok");
    }
    ```

- Verified example (executed during guideline authoring)
  - A temporary file `test/guidelines.demo.test.ts` with a trivial assertion was created and executed via:
    - `bun test test\guidelines.demo.test.ts`
  - Output: “1 pass, 0 fail”. The file was then removed as per the cleanup requirement below.

## Linting, formatting, and code style

- Lint
  - Run: `bun run lint`
  - Auto-fix: `bun run lint:fix`
  - `oxlint` is configured type-aware using `tsconfig.json` and `oxlint-tsgolint` rules.

- Format
  - Run: `bun run fmt`
  - Targets include `src`, `e2e`, `test`, and top-level config files.

- UI/Styles
  - Tailwind v4 is integrated via `@tailwindcss/vite`. Prefer utility classes; `tw-animate-css` is available for animations.

- General code style conventions
  - TypeScript strictness via the repo’s `tsconfig.json`.
  - Use React 19 APIs; Testing Library for component tests; avoid enzyme-style patterns.
  - Keep import order consistent with existing files; colocate tests next to code or under `test/` depending on scope (component/unit under `src`, cross-cutting utilities or integration under `test`).
  - Rust: follow `rustfmt` defaults; prefer small, testable helpers; expose Tauri commands as thin adapters over reusable core logic.

## Troubleshooting and tips specific to this repo

- Windows path quoting
  - When running Bun test for a specific file, pass a Windows path and consider prefixing with `./` if Bun treats it as a filter instead of a path. Example: `bun test .\test\file.test.ts`.

- `remote-e2e` feature
  - The Cargo feature is disabled by default to keep CI lean. For tests that rely on websocket remote control or Tauri window plumbing, enable it via the provided npm script.

- Build sizes and panics
  - Release builds set `panic = "abort"` and `lto = true`. If you need backtraces in a debug session, use `tauri dev` or `cargo test` without `--release`.

- Updating shadcn components
  - The repository includes helpers:
    - Add: `bun run sh-add <component>`
    - Update: `bun run sh-up`

## Housekeeping for contributors

- Keep changes formatted/linted before commits (`bun run fmt && bun run lint`).
- Prefer adding a focused unit/component test alongside code changes; for Rust, keep tests `#[cfg(test)]`-scoped unless they are part of integration suites.
- For E2E changes, run `bun run test:e2e:install` once locally to ensure browsers are available, then `bun run test:e2e`.
