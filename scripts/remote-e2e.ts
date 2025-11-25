import fs from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";

const WS_URL = process.env.REMEDIA_WS_URL || "ws://127.0.0.1:17814";
const START_APP = process.env.START_APP_FOR_REMOTE ?? "1";
const TARGET_URL =
  process.env.REMOTE_TEST_URL ||
  "https://www.redgifs.com/watch/fortunatejumpysunbear";
const TIMEOUT_MS = Number(process.env.REMOTE_TEST_TIMEOUT_MS || "180000");
const START_TIMEOUT_MS = Number(process.env.REMOTE_TEST_START_TIMEOUT_MS || "10000");
const HANDSHAKE_TIMEOUT_MS = Number(process.env.REMOTE_TEST_HANDSHAKE_TIMEOUT_MS || "4000");
const VERBOSE = process.env.ENABLE_REMOTE_HARNESS === "1";
const DOWNLOAD_DIR =
  process.env.REMOTE_TEST_DOWNLOAD_DIR ||
  path.join(tmpdir(), "remedia-remote-downloads");

const DEFAULT_DOWNLOAD_SELECTOR =
  process.env.REMOTE_UI_DOWNLOAD_SELECTOR || 'button[data-testid="download-all"]';
const DEFAULT_PROGRESS_SELECTOR =
  process.env.REMOTE_UI_PROGRESS_SELECTOR || '[data-testid="global-progress"]';

const helperInstallScript = `
  (() => {
    if (window.__REMOTE_UI) return;
    const waitForSelector = (selector, timeout = 5000) => new Promise((resolve, reject) => {
      const start = Date.now();
      const tick = () => {
        const el = document.querySelector(selector);
        if (el) return resolve(el);
        if (Date.now() - start > timeout) return reject(new Error('waitForSelector timeout: ' + selector));
        requestAnimationFrame(tick);
      };
      tick();
    });
    const click = async (selector) => {
      const el = await waitForSelector(selector);
      el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, composed: true }));
      if (el.click) el.click();
    };
    const type = async (selector, text) => {
      const el = await waitForSelector(selector);
      if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
        el.value = text;
        el.dispatchEvent(new Event('input', { bubbles: true }));
      } else {
        el.textContent = text;
      }
    };
    window.__REMOTE_UI = { waitForSelector, click, type };
    console.log('[remote-ui] helpers installed (injected)');
  })();
`;

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function waitForWs(url: string, attempts = 120, delay = 500) {
  for (let i = 0; i < attempts; i++) {
    try {
      const ws = new WebSocket(url);
      await new Promise<void>((resolve, reject) => {
        ws.onopen = () => resolve();
        ws.onerror = (err) => reject(err);
      });
      ws.close();
      return true;
    } catch {
      await sleep(delay);
    }
  }
  return false;
}

function parseJson(text: string) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

async function killStaleRemedia(): Promise<void> {
  try {
    const proc = Bun.spawn({
      cmd: [
        "powershell",
        "-Command",
        "Get-Process remedia,node -ErrorAction SilentlyContinue | Stop-Process -Force",
      ],
      stdout: "ignore",
      stderr: "ignore",
    });
    await proc.exited;
  } catch {
    // ignore failures; best-effort
  }
}

async function runScenario(url: string, downloadUrl: string, expectedPid?: number) {
  const ws = new WebSocket(url);
  await new Promise<void>((resolve, reject) => {
    ws.onopen = () => resolve();
    ws.onerror = (err) => reject(err);
  });

  const rawMessages: string[] = [];
  const events: unknown[] = [];

  ws.onmessage = (ev) => {
    const text = String(ev.data);
    if (VERBOSE) console.log("[remote-e2e] <=", text);
    rawMessages.push(text);
    const parsed = parseJson(text);
    if (parsed) {
      events.push(parsed);
      if (typeof parsed === "object" && parsed !== null && (parsed as any).event === "download-error-detail") {
        console.error("[remote-e2e] download-error-detail", parsed);
      }
    }
  };

  function send(obj: unknown) {
    ws.send(JSON.stringify(obj));
  }

  const waitFor = async (
    predicate: (m: unknown) => boolean,
    label: string,
    timeoutMs: number = TIMEOUT_MS,
  ) => {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const found = events.find(predicate);
      if (found) return found;
      await sleep(250);
    }
    throw new Error(
      `timeout waiting for ${label}; saw ${events.length} events; last=${JSON.stringify(
        events.at(-1),
      )}; raw=${JSON.stringify(rawMessages)}`,
    );
  };

  const handshake = await waitFor(
    (m) => typeof m === "object" && m !== null && (m as any).event === "remote-hello",
    "remote-hello handshake",
    HANDSHAKE_TIMEOUT_MS,
  );
  const handshakePayload = (handshake as any)?.payload ?? {};
  if (expectedPid && Number(handshakePayload.pid) && expectedPid !== Number(handshakePayload.pid)) {
    throw new Error(
      `connected to stale app pid=${handshakePayload.pid}; expected freshly spawned pid=${expectedPid}`,
    );
  }
  if (handshakePayload.enableRemoteHarnessEnv !== "1") {
    throw new Error(
      `ENABLE_REMOTE_HARNESS missing in app env (payload=${JSON.stringify(handshakePayload)})`,
    );
  }

  // Reset state and point downloads to temp dir
  fs.mkdirSync(DOWNLOAD_DIR, { recursive: true });
  send({ action: "clearList" });
  send({ action: "setDownloadDir", path: DOWNLOAD_DIR });

  // Add URL for UI visibility (both via remote event and direct helper for robustness)
  send({ action: "addUrl", url: downloadUrl });
  send({
    action: "runJs",
    url: `${helperInstallScript}; window.__E2E_addUrl && window.__E2E_addUrl(${JSON.stringify(downloadUrl)});`,
  });
  await sleep(500);

  // Install UI helpers (idempotent) and click the Download button via the DOM
  send({ action: "runJs", url: helperInstallScript });
  const clickScript = `
    (async () => {
      const ui = window.__REMOTE_UI;
      if (!ui) throw new Error('REMOTE_UI missing');
      await ui.waitForSelector(${JSON.stringify(DEFAULT_PROGRESS_SELECTOR)}, 5000);
      await ui.click(${JSON.stringify(DEFAULT_DOWNLOAD_SELECTOR)});
    })();
  `;
  send({ action: "runJs", url: clickScript });
  // Also trigger the app's remote start command to avoid UI timing races
  send({ action: "startDownloads" });
  send({ action: "status" });
  send({ action: "runJs", url: "document.body.dataset.remoteTest='1';" });

  const startPredicate = (m: unknown) =>
    typeof m === "object" &&
    m !== null &&
    ((m as any).event === "download-started" ||
      (m as any).event === "download-error" ||
      (m as any).event === "download-queued" ||
      (m as any).event === "download-invoke-ack" ||
      (m as any).event === "download-raw" ||
      (m as any).event === "download-complete");

  try {
    await waitFor(startPredicate, "download-started or download-error", START_TIMEOUT_MS);
  } catch (err) {
    if (VERBOSE) console.error("[remote-e2e] start wait timed out, falling back to direct invoke", err);
    // Fire a direct backend invoke as a fallback
    const directInvoke = `
      (async () => {
        const core = (window as any).__TAURI__?.core;
        if (!core) throw new Error('tauri core missing for direct invoke');
        const path = ${JSON.stringify(DOWNLOAD_DIR)};
        const settings = {
          downloadMode: "video",
          videoQuality: "best",
          maxResolution: "no-limit",
          videoFormat: "best",
          audioFormat: "best",
          audioQuality: "0",
          downloadRateLimit: "unlimited",
          maxFileSize: "unlimited"
        };
        await core.invoke("download_media", {
          mediaIdx: 0,
          mediaSourceUrl: ${JSON.stringify(downloadUrl)},
          outputLocation: path,
          settings
        });
      })();
    `;
    send({ action: "runJs", url: directInvoke });
    await waitFor(startPredicate, "download-started or download-error (fallback)", START_TIMEOUT_MS * 2);
  }
  if (
    events.some(
      (m) => typeof m === "object" && m !== null && (m as any).event === "download-error",
    )
  ) {
    throw new Error(`download-error received early; events=${JSON.stringify(events)}`);
  }

  // Wait for progress to move
  await waitFor(
    (m) =>
      typeof m === "object" &&
      m !== null &&
      (m as any).event === "download-progress" &&
      Array.isArray((m as any).payload) &&
      Number((m as any).payload[1]) > 0.1,
    "download-progress",
  );

  // Wait for completion
  await waitFor(
    (m) => typeof m === "object" && m !== null && (m as any).event === "download-complete",
    "download-complete",
  );

  send({ action: "cancelAll" });
  await sleep(500);
  ws.close();
  return rawMessages;
}

async function main() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let child: any = null;

  await killStaleRemedia();

  if (!(await waitForWs(WS_URL, 10, 300))) {
    if (START_APP !== "0") {
      console.log(`[remote-e2e] launching app for tests...`);
      child = Bun.spawn(["bun", "tauri", "dev"], {
        stdout: "inherit",
        stderr: "inherit",
        env: {
          ...process.env,
          ENABLE_REMOTE_HARNESS: "1",
          REMEDIA_REMOTE_WS: "1",
          PORT: process.env.PORT ?? "1424",
          TAURI_DEV_PORT: process.env.TAURI_DEV_PORT ?? "1424",
        },
      });
      const ready = await waitForWs(WS_URL, 120, 500);
      if (!ready) {
        console.error("[remote-e2e] failed to connect to app websocket");
        child?.kill();
        process.exit(1);
      }
    } else {
      console.error("[remote-e2e] app not running and START_APP_FOR_REMOTE=0");
      process.exit(1);
    }
  }

  const messages = await runScenario(WS_URL, TARGET_URL, child?.pid);
  const ok = messages.some((m) => m.includes('"ok":true'));
  const gotComplete = messages.some((m) => m.includes('"event":"download-complete"'));
  if (!ok || !gotComplete) {
    console.error("[remote-e2e] missing responses:", { ok, gotComplete, messages });
    child?.kill();
    process.exit(1);
  }

  child?.kill();
  console.log("[remote-e2e] passed");
}

main().catch((err) => {
  console.error("[remote-e2e] failure:", err);
  process.exit(1);
});
