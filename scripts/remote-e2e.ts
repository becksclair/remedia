#!/usr/bin/env bun

/**
 * Remote E2E harness
 *
 * Connects to the Tauri remote-control websocket and drives the UI via
 * window.__REMOTE_UI to verify that the Settings window and Debug Console
 * Tauri windows are created and visible.
 *
 * Prerequisites:
 * - The app is already running with the remote harness enabled
 *   (ENABLE_REMOTE_HARNESS=1 or debug build default) and listening on
 *   ws://127.0.0.1:17814.
 */

const DEFAULT_WS_URL = process.env.REMEDIA_WS_URL ?? "ws://127.0.0.1:17814";

function parseEnvInt(envVar: string | undefined, defaultValue: number, min: number = 1): number {
  if (envVar === undefined) return defaultValue;
  const parsed = parseInt(envVar, 10);
  if (isNaN(parsed) || parsed <= 0) return defaultValue;
  return Math.max(parsed, min);
}

const HANDSHAKE_TIMEOUT_MS = parseEnvInt(process.env.REMOTE_E2E_HANDSHAKE_TIMEOUT_MS, 5000);
const WAIT_TIMEOUT_MS = parseEnvInt(process.env.REMOTE_E2E_RESULT_TIMEOUT_MS, 15000);
const RUN_JS_SETTLE_DELAY_MS = parseEnvInt(process.env.REMOTE_E2E_SETTLE_MS, 1500);

interface RemoteHelloMessage {
  event: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  payload?: any;
}

type MessageListener = (raw: string, parsed: unknown) => void;

type MessageHub = (listener: MessageListener) => () => void;

function createMessageHub(ws: WebSocket): MessageHub {
  const listeners = new Set<MessageListener>();

  ws.onmessage = (event) => {
    const raw = typeof event.data === "string" ? event.data : String(event.data);
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = undefined;
    }

    for (const listener of listeners) {
      try {
        listener(raw, parsed);
      } catch (error) {
        console.error("Error in message listener:", error);
        // Continue to next listener after logging the error
      }
    }
  };

  return (listener: MessageListener) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  };
}

function waitForOpen(ws: WebSocket): Promise<void> {
  return new Promise((resolve, reject) => {
    // Check if WebSocket is already OPEN
    if (ws.readyState === WebSocket.OPEN) {
      resolve();
      return;
    }

    // Immediately reject if WebSocket is CLOSING or CLOSED
    if (ws.readyState === WebSocket.CLOSING) {
      reject(new Error(`WebSocket is CLOSING (readyState: ${ws.readyState})`));
      return;
    }

    if (ws.readyState === WebSocket.CLOSED) {
      reject(new Error(`WebSocket is CLOSED (readyState: ${ws.readyState})`));
      return;
    }

    // Define handlers that will clean themselves up
    const handleOpen = () => {
      cleanup();
      resolve();
    };

    const handleError = (err: Event) => {
      cleanup();
      reject(err);
    };

    const handleClose = () => {
      cleanup();
      reject(new Error(`WebSocket closed before opening (readyState: ${ws.readyState})`));
    };

    const cleanup = () => {
      ws.onopen = null;
      ws.onerror = null;
      ws.onclose = null;
    };

    // Attach handlers
    ws.onopen = handleOpen;
    ws.onerror = handleError;
    ws.onclose = handleClose;
  });
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function waitForHandshake(onMessage: MessageHub): Promise<RemoteHelloMessage> {
  return new Promise((resolve, reject) => {
    let unsubscribe: () => void;

    const timer = setTimeout(() => {
      unsubscribe?.();
      reject(new Error("Timed out waiting for remote-hello payload"));
    }, HANDSHAKE_TIMEOUT_MS);

    unsubscribe = onMessage((_raw, parsed) => {
      if (
        parsed &&
        typeof parsed === "object" &&
        (parsed as Partial<RemoteHelloMessage>).event === "remote-hello"
      ) {
        clearTimeout(timer);
        unsubscribe();
        resolve(parsed as RemoteHelloMessage);
      }
    });
  });
}

function createSender(ws: WebSocket) {
  return (payload: unknown) => {
    const serialized = JSON.stringify(payload);
    console.log(`[remote-e2e=>] ${serialized}`);
    ws.send(serialized);
  };
}

async function waitForActionAck(
  onMessage: MessageHub,
  action: string,
): Promise<{ ok?: boolean; error?: string }> {
  return new Promise((resolve, reject) => {
    let unsubscribe: () => void;

    const timer = setTimeout(() => {
      unsubscribe?.();
      reject(new Error(`Timed out waiting for ${action} ack`));
    }, WAIT_TIMEOUT_MS);

    unsubscribe = onMessage((_raw, parsed) => {
      if (!parsed || typeof parsed !== "object") return;
      const env = parsed as { action?: string; ok?: boolean; error?: string };
      if (env.action === action) {
        clearTimeout(timer);
        unsubscribe();
        resolve(env);
      }
    });
  });
}

async function runJsAndSettle(
  send: (payload: unknown) => void,
  onMessage: MessageHub,
  script: string,
) {
  send({ action: "runJs", url: script });
  const ack = await waitForActionAck(onMessage, "runJs");
  if (ack.ok === false) {
    throw new Error(`runJs failed: ${ack.error ?? "unknown error"}`);
  }
  await delay(RUN_JS_SETTLE_DELAY_MS);
}

function buildSettingsActionScript(): string {
  return `
    (async () => {
      try {
        if (!window.__REMOTE_UI) {
          throw new Error("REMOTE_UI not installed");
        }

        await window.__REMOTE_UI.click('[data-testid="open-settings"]', { visible: true });

        await new Promise((r) => setTimeout(r, 500));

      } catch (e) {
        console.error("[remote-e2e] settings action error", e);
      }
    })();
  `;
}

function buildDebugConsoleActionScript(): string {
  return `
    (async () => {
      try {
        if (!window.__REMOTE_UI) {
          throw new Error("REMOTE_UI not installed");
        }

        const trigger = await window.__REMOTE_UI.waitForSelector('[data-testid="media-context-trigger"]', { visible: true });
        trigger.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, button: 2, buttons: 2 }));
        await new Promise((r) => setTimeout(r, 200));
        await window.__REMOTE_UI.click('[data-testid="ctx-show-debug"]', { visible: true, scroll: false });

        await new Promise((r) => setTimeout(r, 500));
      } catch (e) {
        console.error("[remote-e2e] debug action error", e);
      }
    })();
  `;
}

async function assertSettingsWindow(send: (payload: unknown) => void, onMessage: MessageHub) {
  console.log("[remote-e2e] Checking settings window via runJs + inspectWindow...");
  await runJsAndSettle(send, onMessage, buildSettingsActionScript());
  const result = await inspectWindow(send, onMessage, "settings");
  if (!result.ok) {
    throw new Error(`inspectWindow(settings) failed: ${result.error ?? "unknown error"}`);
  }
  if (!result.visible) {
    throw new Error("settings window does not exist after clicking Open settings");
  }
}

async function assertDebugConsoleWindow(send: (payload: unknown) => void, onMessage: MessageHub) {
  console.log("[remote-e2e] Checking debug console window via runJs + inspectWindow...");
  await runJsAndSettle(send, onMessage, buildDebugConsoleActionScript());
  const result = await inspectWindow(send, onMessage, "debug-console");
  if (!result.ok) {
    throw new Error(`inspectWindow(debug-console) failed: ${result.error ?? "unknown error"}`);
  }
  if (!result.visible) {
    throw new Error("debug console window does not exist after triggering from context menu");
  }
}

async function inspectWindow(
  send: (payload: unknown) => void,
  onMessage: MessageHub,
  label: string,
): Promise<InspectWindowEnvelope> {
  send({ action: "inspectWindow", url: label });
  return waitForInspectWindow(onMessage);
}

interface InspectWindowEnvelope {
  ok: boolean;
  action: string;
  label?: string;
  visible?: boolean;
  focused?: boolean;
  minimized?: boolean;
  error?: string;
}

async function waitForInspectWindow(onMessage: MessageHub): Promise<InspectWindowEnvelope> {
  return new Promise((resolve, reject) => {
    let unsubscribe: () => void;

    const timer = setTimeout(() => {
      unsubscribe?.();
      reject(new Error("Timed out waiting for inspectWindow response"));
    }, WAIT_TIMEOUT_MS);

    unsubscribe = onMessage((_raw, parsed) => {
      if (!parsed || typeof parsed !== "object") return;
      const env = parsed as Partial<InspectWindowEnvelope>;
      if (env.action === "inspectWindow") {
        clearTimeout(timer);
        unsubscribe();
        resolve(env as InspectWindowEnvelope);
      }
    });
  });
}

async function main() {
  const wsUrl = DEFAULT_WS_URL;
  console.log(`[remote-e2e] connecting to ${wsUrl}`);

  const ws = new WebSocket(wsUrl);
  try {
    await waitForOpen(ws);
    const onMessage = createMessageHub(ws);
    const send = createSender(ws);

    const hello = await waitForHandshake(onMessage);
    console.log("[remote-e2e] handshake:", hello);

    await assertSettingsWindow(send, onMessage);
    await assertDebugConsoleWindow(send, onMessage);

    console.log("[remote-e2e] All remote window tests passed.");
  } finally {
    if (ws.readyState !== WebSocket.CLOSED) {
      ws.close();
    }
  }
}

main().catch((err) => {
  console.error("[remote-e2e] FAILED:", err);
  process.exit(1);
});
