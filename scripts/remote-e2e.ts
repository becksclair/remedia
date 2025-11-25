const WS_URL = process.env.REMEDIA_WS_URL || "ws://127.0.0.1:17814";
const START_APP = process.env.START_APP_FOR_REMOTE ?? "1";
const TARGET_URL =
  process.env.REMOTE_TEST_URL ||
  "https://www.redgifs.com/watch/fortunatejumpysunbear";
const TIMEOUT_MS = Number(process.env.REMOTE_TEST_TIMEOUT_MS || "180000");

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

async function runScenario(url: string, downloadUrl: string) {
  const ws = new WebSocket(url);
  await new Promise<void>((resolve, reject) => {
    ws.onopen = () => resolve();
    ws.onerror = (err) => reject(err);
  });

  const rawMessages: string[] = [];
  const events: unknown[] = [];

  ws.onmessage = (ev) => {
    const text = String(ev.data);
    rawMessages.push(text);
    const parsed = parseJson(text);
    if (parsed) events.push(parsed);
  };

  function send(obj: unknown) {
    ws.send(JSON.stringify(obj));
  }

  const waitFor = async (predicate: (m: unknown) => boolean, label: string) => {
    const start = Date.now();
    while (Date.now() - start < TIMEOUT_MS) {
      const found = events.find(predicate);
      if (found) return found;
      await sleep(250);
    }
    throw new Error(`timeout waiting for ${label}`);
  };

  // Kick off a real download
  send({ action: "addUrl", url: downloadUrl });
  send({ action: "startDownloads" });
  send({ action: "status" });
  send({ action: "runJs", url: "document.body.dataset.remoteTest='1';" });

  // Wait for queueing/start
  await waitFor(
    (m) => typeof m === "object" && m !== null && (m as any).event === "download-started",
    "download-started",
  );

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

  if (!(await waitForWs(WS_URL, 10, 300))) {
    if (START_APP !== "0") {
      console.log(`[remote-e2e] launching app for tests...`);
      child = Bun.spawn(["bun", "tauri", "dev"], {
        stdout: "inherit",
        stderr: "inherit",
        env: {
          ...process.env,
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

  const messages = await runScenario(WS_URL, TARGET_URL);
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
