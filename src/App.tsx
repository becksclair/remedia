/**
 * Main Application Component (Refactored)
 *
 * Orchestrates the main media downloader interface.
 * Now uses extracted components and hooks for better maintainability.
 */

import { useEffect, useState, useMemo } from "react";
import type { JSX } from "react";
import type { Event } from "@tauri-apps/api/event";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";

// Components
import { DropZone } from "./components/drop-zone";
import { SettingsDialog } from "./components/settings-dialog";
import { MediaTable } from "./components/MediaTable";
import { DownloadControls } from "./components/DownloadControls";
import { MediaListContextMenu } from "./components/MediaListContextMenu";

// Hooks
import { useWindowFocus } from "@/hooks/use-window-focus";
import { useTauriEvents } from "@/hooks/useTauriEvent";
import { useMediaList } from "@/hooks/useMediaList";
import { useDownloadManager } from "@/hooks/useDownloadManager";
import { useTheme } from "@/hooks/useTheme";

// State
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { downloadLocationAtom } from "@/state/settings-atoms";
import { tableRowSelectionAtom, addLogEntryAtom } from "@/state/app-atoms";

// Utils
import { isValidUrl, clampProgress, getSelectedIndices } from "@/utils/media-helpers";
import {
  DRAG_HOVER_DEBOUNCE_MS,
  DEBUG_CONSOLE_WIDTH,
  DEBUG_CONSOLE_HEIGHT,
  PREVIEW_WINDOW_WIDTH,
  PREVIEW_WINDOW_HEIGHT,
} from "@/utils/constants";
import { isTauriRuntime } from "@/utils/env";

// Types
import type { MediaInfoEvent, MediaProgressEvent } from "@/types";

// Tauri API
import { useTauriApi } from "@/lib/TauriApiContext";

import "./App.css";

// Global declarations for E2E testing
declare global {
  interface Window {
    __E2E_addUrl?: (url: string) => void;
  }
}

/**
 * Debounce helper function
 */
function debounce(callback: () => void, delay: number): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return () => {
    if (timer !== undefined) clearTimeout(timer);
    timer = setTimeout(callback, delay);
  };
}

/**
 * Main App Component
 */
function App(): JSX.Element {
  const tauriApi = useTauriApi();

  // Apply theme
  useTheme();

  // Local state
  const harnessEnabled = useMemo(() => {
    const env = (import.meta as any).env;
    return env?.ENABLE_REMOTE_HARNESS === "1";
  }, []);
  const logAction = (...args: unknown[]) => {
    if (harnessEnabled) console.log("[remote-action]", ...args);
  };

  const [notificationPermission, setNotificationPermission] = useState(false);
  const [dragHovering, setDragHovering] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [remoteStartRequested, setRemoteStartRequested] = useState(false);

  // Global state
  const outputLocation = useAtomValue(downloadLocationAtom);
  const setOutputLocation = useSetAtom(downloadLocationAtom);
  const [rowSelection] = useAtom(tableRowSelectionAtom);
  const addLogEntry = useSetAtom(addLogEntryAtom);

  // Custom hooks
  const {
    mediaList,
    addMediaUrl,
    updateMediaItem,
    updateMediaItemByIndex,
    removeItem,
    removeAll,
    removeItemsAtIndices,
  } = useMediaList();

  const { globalProgress, globalDownloading, startDownload, cancelAllDownloads } =
    useDownloadManager(mediaList);

  /**
   * Request notification permissions
   */
  useEffect(() => {
    if (!isTauriRuntime()) return;

    void (async () => {
      try {
        const granted = await tauriApi.notification.isPermissionGranted();
        if (!granted) {
          console.log("Requesting notification permission");
          const permission = await tauriApi.notification.requestPermission();
          console.log("Notification permission:", permission);
          setNotificationPermission(permission === "granted");
        } else {
          console.log("Notification permission already granted:", granted);
          setNotificationPermission(granted);
        }
      } catch (error) {
        console.error("Notification permission check failed:", error);
        setNotificationPermission(false);
      }
    })();
  }, [tauriApi.notification]);

  /**
   * Set default download directory
   */
  useEffect(() => {
    if (outputLocation) return;

    void (async () => {
      try {
        const dir = await tauriApi.path.getDownloadDir();
        setOutputLocation(dir);
      } catch (error) {
        console.error("Failed to get download directory:", error);
      }
    })();
  }, [tauriApi.path, outputLocation, setOutputLocation]);

  /**
   * Expose test helper for E2E tests
   */
  useEffect(() => {
    if (
      typeof window !== "undefined" &&
      (process.env.NODE_ENV === "test" || process.env.NODE_ENV === "development")
    ) {
      window.__E2E_addUrl = (url: string) => {
        if (isValidUrl(url)) addMediaUrl(url);
      };
    }
  }, [addMediaUrl]);

  /**
   * Check clipboard for URLs on window focus
   */
  const handleWindowFocus = () => {
    void (async () => {
      try {
        const text = await tauriApi.clipboard.readText();
        if (isValidUrl(text)) {
          addMediaUrl(text);
          console.log("URL added from clipboard");
        }
      } catch (err) {
        console.log("Error reading clipboard:", err);
      }
    })();
  };

  useWindowFocus(handleWindowFocus);

  /**
   * Handle drag and drop
   */
  const handleDragOver = (event: React.DragEvent<HTMLDivElement>): void => {
    event.preventDefault();
    setDragHovering(true);
  };

  const handleDragLeave = (event: React.DragEvent<HTMLDivElement>): void => {
    event.preventDefault();
    debounce(() => setDragHovering(false), DRAG_HOVER_DEBOUNCE_MS)();
  };

  const dropHandler = (input: string): void => {
    setDragHovering(false);
    if (isValidUrl(input)) {
      addMediaUrl(input);
    }
  };

  /**
   * Preview selected media in a new window.
   * Uses original page URL (not direct stream) to avoid CORS issues.
   * Player has fallback chain: react-player → iframe → error
   */
  async function preview(): Promise<void> {
    const selectedRowIndices = getSelectedIndices(rowSelection);

    if (selectedRowIndices.length === 0) {
      alert("Please select one or more items to preview");
      return;
    }

    try {
      for (const rowIndex of selectedRowIndices) {
        const selectedItem = mediaList[rowIndex];
        if (!selectedItem?.url) continue;

        const previewLabel = `preview-win-${rowIndex}-${Date.now()}`;
        const win: WebviewWindow = tauriApi.window.createWindow(previewLabel, {
          url: `/player?url=${encodeURIComponent(selectedItem.url)}`,
          width: PREVIEW_WINDOW_WIDTH,
          height: PREVIEW_WINDOW_HEIGHT,
          title: selectedItem.title ? `Preview: ${selectedItem.title}` : "ReMedia Preview",
        });

        void win.once("tauri://error", (error: unknown) => {
          console.error("Error creating preview window:", error);
        });
      }

      if (notificationPermission) {
        tauriApi.notification.sendNotification({
          body: `Loading ${selectedRowIndices.length} media preview(s)...`,
          title: "Remedia",
        });
      }
    } catch (error) {
      console.error("Error opening preview window:", error);
      alert(`Failed to open preview: ${String(error)}`);
    }
  }

  /**
   * Context menu handlers
   */
  const handleRemoveSelected = (): void => {
    const selectedIndices = getSelectedIndices(rowSelection);
    if (selectedIndices.length === 0) return;
    removeItemsAtIndices(new Set(selectedIndices));
  };

  const handleRemoveAll = (): void => {
    removeAll();
  };

  const handleCopyAllUrls = async (): Promise<void> => {
    if (mediaList.length === 0) return;

    const urls = mediaList.map((item) => item.url).join("\n");
    const canUseBrowserClipboard =
      typeof navigator !== "undefined" && typeof navigator.clipboard?.writeText === "function";

    if (canUseBrowserClipboard) {
      try {
        await navigator.clipboard.writeText(urls);
      } catch (err) {
        console.error("Browser clipboard write failed:", err);
        return;
      }
    } else if (tauriApi.clipboard?.writeText) {
      try {
        await tauriApi.clipboard.writeText(urls);
      } catch (err) {
        console.error("Tauri clipboard write failed:", err);
        return;
      }
    } else {
      console.warn("No clipboard API available; skipping copy");
      return;
    }

    if (notificationPermission) {
      tauriApi.notification.sendNotification({
        body: `Copied ${mediaList.length} URL(s) to clipboard`,
        title: "ReMedia",
      });
    }
  };

  const handleCancelAll = async (): Promise<void> => {
    logAction("cancel-all");
    await cancelAllDownloads();

    mediaList.forEach((item, idx) => {
      if (item.status === "Downloading" || item.status === "Pending") {
        updateMediaItemByIndex(idx, { status: "Cancelled" });
      }
    });
  };

  const handleStartAllDownloads = async (): Promise<void> => {
    if (globalDownloading) return;
    logAction("start-all", mediaList.length);
    mediaList.forEach((item, idx) => {
      if (item.status !== "Done") {
        updateMediaItemByIndex(idx, { status: "Downloading", progress: 0 });
      }
    });
    await startDownload();
  };

  const handleShowDebugConsole = async (): Promise<void> => {
    try {
      const debugWindow: WebviewWindow = tauriApi.window.createWindow("debug-console", {
        url: "/debug",
        width: DEBUG_CONSOLE_WIDTH,
        height: DEBUG_CONSOLE_HEIGHT,
        title: "ReMedia Debug Console",
      });

      void debugWindow.once("tauri://created", () => {
        console.log("Debug console window created");
      });

      void debugWindow.once("tauri://error", (error: unknown) => {
        console.error("Error creating debug console window:", error);
      });
    } catch (error) {
      console.error("Failed to open debug console:", error);
    }
  };

  /**
   * Tauri event handlers
   */
  const handleMediaInfo = ({
    payload: [_mediaIdx, mediaSourceUrl, title, thumbnail, previewUrl],
  }: Event<MediaInfoEvent>): void => {
    updateMediaItem({
      thumbnail,
      title,
      url: mediaSourceUrl,
      previewUrl: previewUrl || undefined,
    });
  };

  const handleProgress = (event: Event<MediaProgressEvent>): void => {
    const [mediaIdx, progress] = event.payload as MediaProgressEvent;
    updateMediaItemByIndex(mediaIdx, {
      progress: clampProgress(progress),
      status: "Downloading",
    });
  };

  const handleComplete = (event: Event<number>): void => {
    const mediaIdx = event.payload;
    updateMediaItemByIndex(mediaIdx, { progress: 100, status: "Done" });
  };

  const handleError = (event: Event<number>): void => {
    const mediaIdx = event.payload;
    updateMediaItemByIndex(mediaIdx, { status: "Error" });
  };

  const handleCancelled = (event: Event<number>): void => {
    const mediaIdx = event.payload;
    updateMediaItemByIndex(mediaIdx, { status: "Cancelled" });
  };

  const handleRemoteAddUrl = (event: Event<string>): void => {
    const url = event.payload;
    if (typeof url === "string") {
      addMediaUrl(url);
      logAction("remote-add-url", url);
      setRemoteStartRequested(true);
    }
  };

  const handleRemoteStart = (): void => {
    logAction("remote-start-downloads");
    setRemoteStartRequested(true);
    void handleStartAllDownloads();
  };

  const handleRemoteCancel = (): void => {
    logAction("remote-cancel-downloads");
    void handleCancelAll();
  };

  const handleRemoteClear = (): void => {
    logAction("remote-clear-list");
    removeAll();
    setRemoteStartRequested(false);
  };

  const handleRemoteSetDownloadDir = (event: Event<string>): void => {
    const path = event.payload;
    if (typeof path === "string" && path.trim()) {
      logAction("remote-set-download-dir", path);
      setOutputLocation(path);
    }
  };
  const handleYtDlpStderr = (event: Event<[number, string]>): void => {
    const [mediaIdx, message] = event.payload;
    console.log(`[yt-dlp stderr][media ${mediaIdx}]: ${message}`);

    // Normalize case once for robust log-level detection
    const messageLower = message.toLowerCase();

    // Determine log level using canonical prefixes and word-boundary regex
    let level: "error" | "warn" | "info" = "info";

    // Check canonical log prefixes first (most reliable)
    if (message.startsWith("ERROR") || message.startsWith("Error") || message.startsWith("error")) {
      level = "error";
    } else if (
      message.startsWith("WARNING") ||
      message.startsWith("Warning") ||
      message.startsWith("WARN") ||
      message.startsWith("Warn") ||
      message.startsWith("warn")
    ) {
      level = "warn";
    } else {
      // Fallback to word-boundary regex for whole-word severity tokens
      if (/\b(error|err)\b/i.test(messageLower)) {
        level = "error";
      } else if (/\b(warn|warning)\b/i.test(messageLower)) {
        level = "warn";
      }
    }

    addLogEntry({
      timestamp: Date.now(),
      source: "yt-dlp",
      level,
      message,
      mediaIdx,
    });
  };

  // Subscribe to Tauri events
  useTauriEvents({
    "update-media-info": handleMediaInfo,
    "download-progress": handleProgress,
    "download-complete": handleComplete,
    "download-error": handleError,
    "download-cancelled": handleCancelled,
    "remote-add-url": handleRemoteAddUrl,
    "remote-start-downloads": handleRemoteStart,
    "remote-cancel-downloads": handleRemoteCancel,
    "remote-clear-list": handleRemoteClear,
    "remote-set-download-dir": handleRemoteSetDownloadDir,
    "yt-dlp-stderr": handleYtDlpStderr,
  });

  // Kick off pending remote start after media list materializes
  useEffect(() => {
    if (remoteStartRequested && mediaList.length > 0) {
      setRemoteStartRequested(false);
      void handleStartAllDownloads();
    }
  }, [remoteStartRequested, mediaList, handleStartAllDownloads]);

  return (
    <main className="container" onDragOver={handleDragOver} onDragLeave={handleDragLeave}>
      <div className="app-container compact flex flex-col justify-between gap-y-4 h-screen">
        {/* Drop Zone */}
        <DropZone
          className="flex-auto grow overflow-y-auto"
          dropHandler={dropHandler}
          dragHovering={dragHovering}
        />

        {/* Media List with Context Menu */}
        <MediaListContextMenu
          onDownloadAll={handleStartAllDownloads}
          onCancelAll={handleCancelAll}
          onRemoveSelected={handleRemoveSelected}
          onRemoveAll={handleRemoveAll}
          onCopyAllUrls={handleCopyAllUrls}
          onShowDebugConsole={handleShowDebugConsole}
        >
          <MediaTable
            className="flex-auto grow overflow-y-auto"
            mediaList={mediaList}
            onRemoveItem={removeItem}
          />
        </MediaListContextMenu>

        {/* Download Controls */}
        <DownloadControls
          globalProgress={globalProgress}
          globalDownloading={globalDownloading}
          onDownload={handleStartAllDownloads}
          onCancel={handleCancelAll}
          onPreview={preview}
          onSettings={() => setSettingsOpen(true)}
          onQuit={() => tauriApi.commands.quit()}
        />
      </div>

      {/* Settings Dialog */}
      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
    </main>
  );
}

export default App;
