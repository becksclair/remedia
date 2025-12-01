import { mockTauriApi } from "@/lib/tauri-api.mock";
import { ErrorHandlers } from "@/shared/error-handler";
import {
  createMockMediaItem,
  createMockRowSelection,
  renderWithProviders,
  waitFor,
} from "@/test/test-utils";
import { afterEach, describe, expect, it, mock, spyOn } from "bun:test";
import { createElement, useEffect } from "react";

import { usePreviewLauncher } from "./usePreviewLauncher";

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
  const ready = mock(() => {});

  renderWithProviders(
    createElement(PreviewHarness, {
      mediaList: options.mediaList,
      rowSelection: options.rowSelection,
      notificationPermission: options.notificationPermission,
      onReady: ready,
    }),
  );

  await waitFor(() => expect(ready).toHaveBeenCalledTimes(1));
  // Get the first argument passed to the mock function
  const preview = (ready as any).mock.calls[0][0];
  if (!preview || typeof preview !== "function") {
    throw new Error("Preview handler was not registered");
  }

  return preview as () => Promise<void>;
}

describe("usePreviewLauncher", () => {
  let spies: Array<{ mockRestore: () => void }> = [];
  let originalConsoleError: typeof console.error;

  // Store original console.error before any tests run
  originalConsoleError = console.error;

  afterEach(() => {
    // Restore console.error and cleanup spies
    console.error = originalConsoleError;
    spies.forEach((spy) => {
      if (spy && typeof spy.mockRestore === "function") {
        spy.mockRestore();
      }
    });
    spies = [];
  });

  it("validates when no media rows are selected", async () => {
    const validationSpy = spyOn(ErrorHandlers, "validation").mockImplementation(() => undefined);
    const createWindowSpy = spyOn(mockTauriApi.window, "createWindow");
    spies.push(validationSpy, createWindowSpy);

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
    const createWindowSpy = spyOn(mockTauriApi.window, "createWindow");
    const notificationSpy = spyOn(mockTauriApi.notification, "sendNotification");
    spies.push(createWindowSpy, notificationSpy);

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
    const consoleErrorMock = mock(() => {});
    console.error = consoleErrorMock;

    const error = new Error("preview boom");
    const createWindowSpy = spyOn(mockTauriApi.window, "createWindow").mockImplementation(() => {
      throw error;
    });
    const systemSpy = spyOn(ErrorHandlers, "system").mockImplementation(() => undefined);
    spies.push(createWindowSpy, systemSpy);

    const preview = await setupPreview({
      mediaList: [createMockMediaItem("https://example.com/fail")],
      rowSelection: createMockRowSelection([0]),
      notificationPermission: false,
    });

    await preview();

    expect(systemSpy).toHaveBeenCalledWith(error, "open preview window");
  });
});
