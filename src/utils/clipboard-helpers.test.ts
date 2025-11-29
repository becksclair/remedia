import { describe, it, expect, vi } from "vitest";

import { shouldCheckClipboard, processClipboardFocus } from "./clipboard-helpers";

describe("shouldCheckClipboard", () => {
  it("returns false when feature is disabled", () => {
    expect(shouldCheckClipboard(false, 0, 1000)).toBe(false);
  });

  it("returns false when within cooldown", () => {
    const lastDrop = Date.now();
    const now = lastDrop + 100;
    expect(shouldCheckClipboard(true, lastDrop, now)).toBe(false);
  });

  it("returns true when outside cooldown", () => {
    const lastDrop = 0;
    const now = 1000;
    expect(shouldCheckClipboard(true, lastDrop, now)).toBe(true);
  });

  it("respects custom cooldown", () => {
    const lastDrop = 0;
    const now = 400;
    expect(shouldCheckClipboard(true, lastDrop, now, 300)).toBe(true);
    expect(shouldCheckClipboard(true, lastDrop, now, 500)).toBe(false);
  });
});

describe("processClipboardFocus", () => {
  it("adds URL from clipboard when enabled and cooldown elapsed", async () => {
    const readClipboardText = vi.fn().mockResolvedValue("https://example.com");
    const addMediaUrl = vi.fn();
    const logger = vi.fn();

    await processClipboardFocus({
      enabled: true,
      lastDropTimestamp: 0,
      readClipboardText,
      addMediaUrl,
      now: 1000,
      logger,
    });

    expect(readClipboardText).toHaveBeenCalledTimes(1);
    expect(addMediaUrl).toHaveBeenCalledWith("https://example.com");
    expect(logger).toHaveBeenCalledWith("info", "URL added from clipboard: https://example.com");
  });

  it("skips clipboard read when within cooldown", async () => {
    const readClipboardText = vi.fn();
    const addMediaUrl = vi.fn();
    const logger = vi.fn();

    await processClipboardFocus({
      enabled: true,
      lastDropTimestamp: 900,
      readClipboardText,
      addMediaUrl,
      now: 1000,
      logger,
    });

    expect(readClipboardText).not.toHaveBeenCalled();
    expect(addMediaUrl).not.toHaveBeenCalled();
    expect(logger).toHaveBeenCalledWith("info", "Skipping clipboard check - drop just occurred");
  });

  it("invokes onError when clipboard read fails", async () => {
    const error = new Error("clipboard failure");
    const readClipboardText = vi.fn().mockRejectedValue(error);
    const onError = vi.fn();
    const logger = vi.fn();

    await processClipboardFocus({
      enabled: true,
      lastDropTimestamp: 0,
      readClipboardText,
      addMediaUrl: vi.fn(),
      now: 1000,
      logger,
      onError,
    });

    expect(logger).toHaveBeenCalledWith("error", "Error reading clipboard: clipboard failure");
    expect(onError).toHaveBeenCalledWith(error);
  });

  it("ignores non-URL clipboard content", async () => {
    const readClipboardText = vi.fn().mockResolvedValue("not-a-url");
    const addMediaUrl = vi.fn();

    await processClipboardFocus({
      enabled: true,
      lastDropTimestamp: 0,
      readClipboardText,
      addMediaUrl,
      now: 1000,
    });

    expect(addMediaUrl).not.toHaveBeenCalled();
  });
});
