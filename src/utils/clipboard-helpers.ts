import { isValidUrl } from "@/utils/media-helpers";

type ClipboardLogLevel = "info" | "warn" | "error";
type ClipboardLogger = (level: ClipboardLogLevel, message: string) => void;

const defaultClipboardLogger: ClipboardLogger = (level, message) => {
  console.log(`[clipboard][${level}]`, message);
};

export function shouldCheckClipboard(
  enabled: boolean,
  lastDropTimestamp: number,
  now: number,
  cooldownMs = 500,
): boolean {
  if (!enabled) return false;
  const elapsed = now - lastDropTimestamp;
  return elapsed >= cooldownMs;
}

interface ClipboardFocusOptions {
  enabled: boolean;
  lastDropTimestamp: number;
  readClipboardText: () => Promise<string>;
  addMediaUrl: (url: string) => void;
  cooldownMs?: number;
  now?: number;
  logger?: ClipboardLogger;
  onError?: (error: unknown) => void;
}

export async function processClipboardFocus({
  enabled,
  lastDropTimestamp,
  readClipboardText,
  addMediaUrl,
  cooldownMs = 500,
  now = Date.now(),
  logger = defaultClipboardLogger,
  onError,
}: ClipboardFocusOptions): Promise<void> {
  if (!shouldCheckClipboard(enabled, lastDropTimestamp, now, cooldownMs)) {
    if (enabled && now - lastDropTimestamp < cooldownMs) {
      logger("info", "Skipping clipboard check - drop just occurred");
    }
    return;
  }

  try {
    const text = await readClipboardText();
    if (isValidUrl(text)) {
      addMediaUrl(text);
      logger("info", `URL added from clipboard: ${text}`);
    }
  } catch (error) {
    logger(
      "error",
      `Error reading clipboard: ${error instanceof Error ? error.message : String(error)}`,
    );
    if (onError) onError(error);
  }
}
