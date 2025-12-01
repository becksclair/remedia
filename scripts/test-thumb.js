// Quick test: Add RedGifs URL, fetch metadata, and check thumbnail
import fs from "node:fs";
import path from "node:path";

const TARGET_URL = "https://www.redgifs.com/watch/fortunatejumpysunbear";
const DOWNLOAD_DIR = process.env.DOWNLOAD_DIR
  ? path.resolve(process.env.DOWNLOAD_DIR)
  : path.join(__dirname, "..", "tmp-downloads");

const ws = new WebSocket("ws://127.0.0.1:17814");
const messages = [];

function send(data) {
  const msg = JSON.stringify(data);
  console.log("[=>]", msg);
  ws.send(msg);
}

function waitFor(predicate, timeout = 30000) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const check = () => {
      for (const m of messages) {
        if (predicate(m)) return resolve(m);
      }
      if (Date.now() - start > timeout) return reject(new Error("Timeout"));
      setTimeout(check, 100);
    };
    check();
  });
}

ws.onopen = async () => {
  console.log("Connected to remote harness");

  // Clear and set up
  send({ action: "clearList" });
  await waitFor((m) => m?.ok && m?.action === "clearList");

  send({ action: "setDownloadDir", path: DOWNLOAD_DIR });
  await waitFor((m) => m?.ok && m?.action === "setDownloadDir");

  send({ action: "addUrl", url: TARGET_URL });
  await waitFor((m) => m?.ok && m?.action === "addUrl");

  // Fetch metadata
  send({
    action: "runJs",
    url: `
    (async () => {
      const core = window.__TAURI__?.core;
      if (!core) throw new Error('no core');
      await core.invoke('get_media_info', { 
        mediaIdx: 0, 
        mediaSourceUrl: '${TARGET_URL}' 
      });
    })();
  `,
  });

  // Wait for backend to emit thumbnail info
  const mediaInfo = await waitFor((m) => m?.event === "update-media-info");
  const thumbnail = mediaInfo?.payload?.[3];
  console.log("✓ Backend thumbnail:", thumbnail?.substring(0, 60) + "...");

  // Give React time to render
  await new Promise((r) => setTimeout(r, 1000));

  // Capture DOM state
  const script = fs.readFileSync("scripts/debug-thumb.js", "utf-8");
  send({ action: "runJs", url: script });
  await waitFor((m) => m?.ok && m?.action === "runJs");

  // Wait for unified debug-snapshot event (forwarded from Tauri)
  console.log("⏳ Waiting for thumbnail state (debug-snapshot)...");
  try {
    const debugResult = await Promise.race([
      waitFor((m) => m?.event === "debug-snapshot" && m?.payload?.kind === "thumbnail", 5000),
      new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), 5000)),
    ]);

    const snapshot = debugResult?.payload || {};
    const payload = snapshot.data || snapshot;

    console.log("\n✅ Thumbnail state received:");
    console.log(
      "  DOM:",
      payload.isRedGifs ? "✅ RedGifs" : payload.isPlaceholder ? "❌ Placeholder" : "❓ Other",
    );
    console.log("  State:", payload.stateIsRedGifs ? "✅ RedGifs" : "❓ Other");
    console.log("  DOM src:", payload.domSrc);
    console.log("  State thumbnail:", payload.stateThumbnail);
  } catch (err) {
    console.log("❌ No debug-snapshot received (Tauri event might not be forwarded)");
    console.error("Debug-snapshot error:", err);
  }

  ws.close();
  process.exit(0);
};

ws.onmessage = (event) => {
  const text = String(event.data);
  try {
    const parsed = JSON.parse(text);
    messages.push(parsed);
    if (parsed.event === "update-media-info" || parsed.event === "debug-snapshot") {
      console.log("[<=]", text.substring(0, 200));
    }
  } catch {
    messages.push(text);
  }
};

ws.onerror = (err) => {
  console.error("WebSocket error:", err);
  process.exit(1);
};

setTimeout(() => {
  console.error("Global timeout");
  ws.close();
  process.exit(1);
}, 60000);
