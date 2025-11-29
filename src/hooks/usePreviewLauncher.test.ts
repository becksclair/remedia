import { createElement, useEffect } from "react";
import { describe, it, expect, vi, afterEach } from "vitest";

import {
  renderWithProviders,
  waitFor,
  createMockMediaItem,
  createMockRowSelection,
} from "@/test/test-utils";
import { usePreviewLauncher } from "./usePreviewLauncher";
import { ErrorHandlers } from "@/shared/error-handler";
import { mockTauriApi } from "@/lib/tauri-api.mock";

type PreviewHarnessProps = {
  mediaList: ReturnType<typeof createMockMediaItem>[];
  rowSelection: Record<string, boolean>;
  notificationPermission: boolean;
  onReady: (preview: () => Promise<void>) => void;
};

function PreviewHarness({
  mediaList,
  rowSelection,
  notificationPermission,
  onReady,
}: PreviewHarnessProps) {
  const { preview } = usePreviewLauncher({ mediaList, rowSelection, notificationPermission });

  useEffect(() => {
    onReady(preview);
  }, [onReady, preview]);

  return null;
}

async function setupPreview(options: Omit<PreviewHarnessProps, "onReady">) {
  const ready = vi.fn();

  renderWithProviders(
    createElement(PreviewHarness, {
      mediaList: options.mediaList,
      rowSelection: options.rowSelection,
      notificationPermission: options.notificationPermission,
      onReady: ready,
    }),
  );

  await waitFor(() => expect(ready).toHaveBeenCalledTimes(1));
  const preview = ready.mock.calls[0]?.[0];
  if (typeof preview !== "function") {
    throw new Error("Preview handler was not registered");
  }

  return preview as () => Promise<void>;
}

describe("usePreviewLauncher", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("validates when no media rows are selected", async () => {
    const validationSpy = vi.spyOn(ErrorHandlers, "validation").mockImplementation(() => undefined);
    const createWindowSpy = vi.spyOn(mockTauriApi.window, "createWindow");

    const preview = await setupPreview({
      mediaList: [createMockMediaItem("https://example.com/video")],
      rowSelection: {},
      notificationPermission: false,
    });

    await preview();

    expect(validationSpy).toHaveBeenCalled();
    expect(createWindowSpy).not.toHaveBeenCalled();
  });

  it("creates preview windows and sends notifications when permitted", async () => {
    const createWindowSpy = vi.spyOn(mockTauriApi.window, "createWindow");
    const notificationSpy = vi.spyOn(mockTauriApi.notification, "sendNotification");

    const mediaUrl = "https://example.com/watch?v=123";
    const preview = await setupPreview({
      mediaList: [createMockMediaItem(mediaUrl)],
      rowSelection: createMockRowSelection([0]),
      notificationPermission: true,
    });

    await preview();

    expect(createWindowSpy).toHaveBeenCalledWith(
      expect.stringContaining("preview-win-0"),
      expect.objectContaining({
        url: `/player?url=${encodeURIComponent(mediaUrl)}`,
        title: expect.stringContaining("Preview:"),
      }),
    );
    expect(notificationSpy).toHaveBeenCalledWith({
      body: "Loading 1 media preview(s)...",
      title: "Remedia",
    });
  });

  it("reports system errors when window creation fails", async () => {
    const error = new Error("preview boom");
    vi.spyOn(mockTauriApi.window, "createWindow").mockImplementation(() => {
      throw error;
    });
    const systemSpy = vi.spyOn(ErrorHandlers, "system").mockImplementation(() => undefined);

    const preview = await setupPreview({
      mediaList: [createMockMediaItem("https://example.com/fail")],
      rowSelection: createMockRowSelection([0]),
      notificationPermission: false,
    });

    await preview();

    expect(systemSpy).toHaveBeenCalledWith(error, "open preview window");
  });
});
