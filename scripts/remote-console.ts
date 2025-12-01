#!/usr/bin/env bun

import fs from "node:fs/promises";
import path from "node:path";
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

const DEFAULT_WS_URL = process.env.REMEDIA_WS_URL ?? "ws://127.0.0.1:17814";
const HANDSHAKE_TIMEOUT_MS = Number(process.env.REMOTE_CONSOLE_HANDSHAKE_TIMEOUT_MS ?? "4000");
const WAIT_TIMEOUT_DEFAULT = Number(process.env.REMOTE_CONSOLE_WAIT_TIMEOUT_MS ?? "180000");

interface RemoteHelloPayload {
  pid?: number;
  enableRemoteHarnessEnv?: string;
  [key: string]: unknown;
}

function waitForEvent(
  onMessage: MessageHub,
  predicate: (parsed: unknown) => boolean,
  timeoutMs: number,
  label = "event",
): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Timed out waiting for ${label}`));
    }, timeoutMs);

    const unsubscribe = onMessage((_raw, parsed) => {
      if (predicate(parsed)) {
        clearTimeout(timer);
        unsubscribe();
        resolve(parsed);
      }
    });
  });
}

interface RemoteHelloMessage {
  event: "remote-hello";
  payload: RemoteHelloPayload;
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
      listener(raw, parsed);
    }
  };

  return (listener: MessageListener) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  };
}

interface CliOptions {
  wsUrl: string;
  commands: string[];
  waitEvent?: string;
  waitTimeoutMs: number;
  watchEvents: string[];
}

function parseArgs(): CliOptions {
  const args = process.argv.slice(2);
  let wsUrl = DEFAULT_WS_URL;
  const commands: string[] = [];
  let waitEvent: string | undefined;
  let waitTimeoutMs = WAIT_TIMEOUT_DEFAULT;
  const watchEvents: string[] = [];
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if ((arg === "--url" || arg === "-u") && args[i + 1]) {
      wsUrl = args[i + 1];
      i += 1;
    } else if (arg === "--cmd" && args[i + 1]) {
      commands.push(args[i + 1]);
      i += 1;
    } else if (arg === "--wait-event" && args[i + 1]) {
      waitEvent = args[i + 1];
      i += 1;
    } else if (arg === "--wait-timeout" && args[i + 1]) {
      waitTimeoutMs = Number(args[i + 1]) || waitTimeoutMs;
      i += 1;
    } else if (arg === "--watch-event" && args[i + 1]) {
      watchEvents.push(args[i + 1]);
      i += 1;
    }
  }
  return { wsUrl, commands, waitEvent, waitTimeoutMs, watchEvents };
}

function printHelp() {
  console.log(`Available commands:
  :help                 Show this message
  :exit / :quit         Close the console
  :status               Request queue stats
  :start                Trigger remote startDownloads
  :cancel               Trigger remote cancelAll
  :clear                Clear the media list
  :add <url>            Add a media URL
  :dir <path>           Set download directory
  :js <script>          Run inline JavaScript inside the app webview
  :jsfile <path>        Load JS from file and execute via runJs
  :raw <json>           Send arbitrary JSON without validation

Any other input is parsed as JSON and sent directly if valid.`);
}

async function readFileSafe(file: string) {
  const fullPath = path.resolve(file);
  return fs.readFile(fullPath, "utf8");
}

function waitForHandshake(onMessage: MessageHub): Promise<RemoteHelloMessage> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error("Timed out waiting for remote-hello payload"));
    }, HANDSHAKE_TIMEOUT_MS);

    const unsubscribe = onMessage((_raw, parsed) => {
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

function waitForOpen(ws: WebSocket): Promise<void> {
  return new Promise((resolve, reject) => {
    ws.onopen = () => resolve();
    ws.onerror = (err) => reject(err);
  });
}

function createSender(ws: WebSocket) {
  return (payload: unknown) => {
    const serialized = JSON.stringify(payload);
    console.log(`[remote=>] ${serialized}`);
    ws.send(serialized);
  };
}

async function main() {
  const { wsUrl, commands, waitEvent, waitTimeoutMs, watchEvents } = parseArgs();
  console.log(`[remote-console] connecting to ${wsUrl}`);

  const ws = new WebSocket(wsUrl);
  await waitForOpen(ws);
  const onMessage = createMessageHub(ws);

  const watchEventSet = new Set(watchEvents.map((event) => event.toLowerCase()));

  onMessage((raw, parsed) => {
    console.log(`[remote<=] ${raw}`);
    if (
      watchEventSet.size > 0 &&
      parsed &&
      typeof parsed === "object" &&
      (parsed as { event?: string }).event &&
      typeof (parsed as { event?: string }).event === "string"
    ) {
      const eventName = ((parsed as { event?: string }).event ?? "").toLowerCase();
      if (watchEventSet.has(eventName)) {
        const payload = (parsed as { payload?: unknown }).payload ?? null;
        console.log(`[remote<=][watch:${eventName}] payload=${JSON.stringify(payload)}`);
      }
    }
  });

  const handshake = await waitForHandshake(onMessage);
  const send = createSender(ws);

  console.log(
    `[remote-console] connected to pid=${handshake.payload?.pid ?? "unknown"} env=${handshake.payload?.enableRemoteHarnessEnv ?? "?"}`,
  );
  printHelp();

  const aliasActions: Record<string, object> = {
    status: { action: "status" },
    start: { action: "startDownloads" },
    cancel: { action: "cancelAll" },
    clear: { action: "clearList" },
  };

  const exit = (code = 0) => {
    ws.close();
    process.exit(code);
  };

  ws.onclose = () => {
    console.log("[remote-console] websocket closed");
    exit(0);
  };

  ws.onerror = (event) => {
    console.error("[remote-console] websocket error", event);
  };

  const sendRunJs = (script: string) => {
    if (!script) {
      console.error("[remote-console] JS script is empty");
      return;
    }
    send({ action: "runJs", url: script });
  };

  const handleInput = async (line: string) => {
    const trimmed = line.trim();
    if (!trimmed) {
      return;
    }

    if (trimmed === ":help") {
      printHelp();
      return;
    }

    if (trimmed === ":exit" || trimmed === ":quit") {
      exit(0);
      return;
    }

    if (trimmed.startsWith(":")) {
      const [command, ...rest] = trimmed.split(" ");
      const arg = rest.join(" ").trim();
      switch (command) {
        case ":status":
          send({ action: "status" });
          break;
        case ":start":
          send({ action: "startDownloads" });
          break;
        case ":cancel":
          send({ action: "cancelAll" });
          break;
        case ":clear":
          send({ action: "clearList" });
          break;
        case ":add":
          if (!arg) {
            console.error("Usage: :add <url>");
          } else {
            send({ action: "addUrl", url: arg });
          }
          break;
        case ":dir":
          if (!arg) {
            console.error("Usage: :dir <path>");
          } else {
            send({ action: "setDownloadDir", path: arg });
          }
          break;
        case ":js":
          if (!arg) {
            console.error("Usage: :js <script>");
          } else {
            sendRunJs(arg);
          }
          break;
        case ":jsfile":
          if (!arg) {
            console.error("Usage: :jsfile <path>");
          } else {
            try {
              const script = await readFileSafe(arg);
              sendRunJs(script);
            } catch (err) {
              console.error(`Failed to read ${arg}:`, err);
            }
          }
          break;
        case ":raw":
          if (!arg) {
            console.error("Usage: :raw <json>");
          } else {
            try {
              const payload = JSON.parse(arg);
              send(payload);
            } catch (err) {
              console.error("Failed to parse JSON for :raw", err);
            }
          }
          break;
        default:
          console.error(`Unknown command: ${command}`);
      }
      return;
    }

    if (aliasActions[trimmed]) {
      send(aliasActions[trimmed]);
      return;
    }

    try {
      const payload = JSON.parse(trimmed);
      send(payload);
    } catch (err) {
      console.error("Failed to parse input as JSON. Use :help for options.", err);
    }
  };

  if (commands.length > 0) {
    for (const command of commands) {
      console.log(`[remote-console] :: ${command}`);
      await handleInput(command);
    }

    if (waitEvent) {
      console.log(`[remote-console] waiting for event "${waitEvent}" (timeout=${waitTimeoutMs}ms)`);
      await waitForEvent(
        onMessage,
        (parsed) =>
          Boolean(
            parsed &&
            typeof parsed === "object" &&
            (parsed as { event?: string }).event === waitEvent,
          ),
        waitTimeoutMs,
        waitEvent,
      );
      console.log(`[remote-console] event "${waitEvent}" received`);
    }

    if (!waitEvent) {
      console.log("[remote-console] batch complete; close with :exit to stop app if desired");
    }

    exit(0);
    return;
  }

  const rl = readline.createInterface({ input, output, terminal: true, prompt: "remote> " });
  rl.prompt();

  for await (const line of rl) {
    await handleInput(line);
    rl.prompt();
  }
}

main().catch((err) => {
  console.error("[remote-console] fatal error", err);
  process.exit(1);
});
