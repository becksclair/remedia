---
description: release smoke checklist
---

# ReMedia Release Smoke Checklist

Run the following lightweight checks before tagging a release. They keep the critical clipboard/import, remote control, queue, and preview paths green without requiring a full regression sweep.

## 1. Tooling + Environment

1. `bun run fmt && bun run lint && bun run test:run`
2. `bun run build` then `bun tauri build`
3. Launch `bun tauri dev` and confirm the debug console hotkey/context menu still spawns the `/debug` window.

## 2. Core UI Smoke

1. **Startup**: App window renders drop zone + controls, no errors in console.
2. **Settings dialog**: Opens, tabs switch, closing returns focus.
3. **Download location**: Browse button writes a path and persists after reload.
4. **Queue stats**: Add 3 URLs and start downloads; Ensure queued/active counters update when events fire.

## 3. Clipboard Auto-Import

1. Ensure "Auto-import URL from clipboard" is enabled in Settings → General.
2. From devtools console: `window.__E2E_mockState.clipboardContent = "https://example.com/smoke";`
3. Refocus window (Alt+Tab or `window.dispatchEvent(new Event("focus"))`). Row appears with that URL.
4. Disable the toggle, set a new clipboard URL, refocus. Row count should stay the same. Re-enable before release.

## 4. Remote Control Harness

1. With devtools open: `window.__E2E_emitTauriEvent("remote-add-url", "https://example.com/remote-smoke")`.
2. Verify the row appears and `download_media` is queued (check debug console log or `window.__E2E_mockState.commandCalls`).
3. Emit `remote-start-downloads` and confirm downloads begin; emit `remote-clear-list` to ensure pending auto-start resets.

## 5. Preview & Notifications

1. Select a media row and click **Preview**. A new `/player` window opens with query param and no console errors.
2. With OS notifications allowed, trigger Preview again and confirm toast/notification copy.

## 6. Debug Console & Logging

1. Open Debug Console via context menu. Confirm clipboard log entries appear when focus handler runs.
2. Emit a `"yt-dlp-stderr"` event via devtools and verify severity tagging (info/warn/error) in the console feed.

## 7. Automated Coverage Hooks

- `bunx vitest run src/hooks/usePreviewLauncher.test.ts src/hooks/useRemoteControl.test.ts` (ensures preview + remote hooks stay green)
- `bunx playwright test --grep "clipboard auto-import|remote control"` (new smoke e2e coverage)

### Optional: Real Download Smoke (manual)

- `PLAYWRIGHT_REAL_DL=1 bunx playwright test e2e/real-download.spec.ts`
  - Uses real URLs (override via `PLAYWRIGHT_REAL_URL[_ALT]`) to validate download + cancel flows end-to-end.
  - Requires working network + yt-dlp binaries; expect several minutes and potential flakiness, so keep outside CI.

> ✅ Complete all steps (or document deltas) before publishing release notes.
