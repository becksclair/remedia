/**
 * Main Application Component (Refactored)
 *
 * Orchestrates the main media downloader interface.
 * Now uses extracted components and hooks for better maintainability.
 */

import { useEffect, useState, useMemo, useRef, useCallback } from "react";
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
import { usePreviewLauncher } from "@/hooks/usePreviewLauncher";
import { useRemoteControl } from "@/hooks/useRemoteControl";
import { useQueueStatus } from "@/hooks/useQueueStatus";

// State
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import {
  downloadLocationAtom,
  clipboardAutoImportAtom,
  maxConcurrentDownloadsAtom,
} from "@/state/settings-atoms";
import { tableRowSelectionAtom, addLogEntryAtom, type LogEntry } from "@/state/app-atoms";
import { upsertCollectionsAtom } from "@/state/collection-atoms";

// Utils
import { isValidUrl, clampProgress, getSelectedIndices } from "@/utils/media-helpers";
import { processClipboardFocus } from "@/utils/clipboard-helpers";
import { DEBUG_CONSOLE_WIDTH, DEBUG_CONSOLE_HEIGHT } from "@/utils/constants";
import { isTauriRuntime } from "@/utils/env";

// Types
import type { MediaInfoEvent, MediaProgressEvent } from "@/types";
import { TAURI_EVENT } from "@/types";

// Tauri API
import { useTauriApi } from "@/lib/TauriApiContext";
import { mapMediaInfoEventToUpdate } from "@/lib/media-mapping";

import "./App.css";

// Global declarations for E2E testing
declare global {
  interface Window {
    __E2E_addUrl?: (url: string) => void;
  }
}

/**
 * Main App Component
 */
function App(): JSX.Element {
  const tauriApi = useTauriApi();

  // Apply theme
  useTheme();

  // Ref to track when a drop occurred (skip clipboard on focus after drop)
  const lastDropTimeRef = useRef<number>(0);
  // Counter for drag enter/leave to prevent flashing on child elements
  const dragCounterRef = useRef<number>(0);

  // Local state
  const harnessEnabled = useMemo(() => {
    const env = (import.meta as any).env;
    return env?.ENABLE_REMOTE_HARNESS === "1";
  }, []);

  const [notificationPermission, setNotificationPermission] = useState(false);
  const [dragHovering, setDragHovering] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  // Global state
  const outputLocation = useAtomValue(downloadLocationAtom);
  const clipboardAutoImport = useAtomValue(clipboardAutoImportAtom);
  const maxConcurrent = useAtomValue(maxConcurrentDownloadsAtom);
  const setOutputLocation = useSetAtom(downloadLocationAtom);
  const [rowSelection] = useAtom(tableRowSelectionAtom);
  const addLogEntry = useSetAtom(addLogEntryAtom);
  const upsertCollections = useSetAtom(upsertCollectionsAtom);

  const logAction = useCallback((...args: unknown[]) => {
    if (harnessEnabled) console.log("[remote-action]", ...args);
  }, [harnessEnabled]);

  const logClipboard = useCallback(
    (level: LogEntry["level"], message: string) => {
      addLogEntry({
        timestamp: Date.now(),
        source: "app",
        level,
        message,
      });
      if (harnessEnabled) {
        console.log(`[clipboard][${level}]`, message);
      }
    },
    [addLogEntry, harnessEnabled],
  );

  // Custom hooks
  const {
    mediaList,
    addMediaUrl,
    updateMediaItem,
    updateMediaItemByIndex,
    removeItemsAtIndices,
    removeAll,
    removeItem,
  } = useMediaList();
  const { globalProgress, globalDownloading, startDownload, cancelAllDownloads } =
    useDownloadManager(mediaList);
  const { queueStats } = useQueueStatus();
  const completedCount = mediaList.filter((item) => item.status === "Done").length;
  const totalCount = mediaList.length;
  const { preview } = usePreviewLauncher({
    mediaList,
    rowSelection,
    notificationPermission,
  });

  const startAllDownloadsCore = useCallback(async () => {
    if (globalDownloading) return;
    await startDownload();
  }, [globalDownloading, startDownload]);

  const cancelAllDownloadsCore = useCallback(async () => {
    await cancelAllDownloads();
  }, [cancelAllDownloads]);

  useRemoteControl({
    addMediaUrl,
    removeAll,
    setOutputLocation,
    startAllDownloads: startAllDownloadsCore,
    cancelAllDownloads: cancelAllDownloadsCore,
    mediaListLength: mediaList.length,
    logAction,
  });
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
    if (typeof window !== "undefined") {
      window.__E2E_addUrl = (url: string) => {
        if (isValidUrl(url)) addMediaUrl(url);
      };
    }
  }, [addMediaUrl]);

  /**
   * Check clipboard for URLs on window focus.
   * Skip if a drop just occurred (within 500ms) to avoid adding clipboard URL on drag-drop.
   */
  const handleWindowFocus = () => {
    void processClipboardFocus({
      enabled: clipboardAutoImport,
      lastDropTimestamp: lastDropTimeRef.current,
      readClipboardText: () => tauriApi.clipboard.readText(),
      addMediaUrl,
      logger: logClipboard,
    });
  };

  useWindowFocus(handleWindowFocus);

  /**
   * Handle drag and drop
   */
  const handleDragEnter = (event: React.DragEvent<HTMLDivElement>): void => {
    event.preventDefault();
    dragCounterRef.current++;
    if (dragCounterRef.current === 1) {
      setDragHovering(true);
    }
  };

  const handleDragOver = (event: React.DragEvent<HTMLDivElement>): void => {
    event.preventDefault();
  };

  const handleDragLeave = (event: React.DragEvent<HTMLDivElement>): void => {
    event.preventDefault();
    dragCounterRef.current--;
    if (dragCounterRef.current === 0) {
      setDragHovering(false);
    }
  };

  const dropHandler = (input: string): void => {
    lastDropTimeRef.current = Date.now();
    dragCounterRef.current = 0;
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

  const handleCopySelectedUrls = async (): Promise<void> => {
    const selectedIndices = getSelectedIndices(rowSelection);
    if (selectedIndices.length === 0) return;

    const urls = selectedIndices
      .map((idx) => mediaList[idx]?.url)
      .filter(Boolean)
      .join("\n");

    await copyToClipboard(urls, selectedIndices.length);
  };

  const handleCopyAllUrls = async (): Promise<void> => {
    if (mediaList.length === 0) return;

    const urls = mediaList.map((item) => item.url).join("\n");
    await copyToClipboard(urls, mediaList.length);
  };

  const copyToClipboard = async (urls: string, count: number): Promise<void> => {
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
        body: `Copied ${count} URL(s) to clipboard`,
        title: "ReMedia",
      });
    }
  };

  const handleCancelAll = useCallback(async () => {
    logAction("cancel-all");
    await cancelAllDownloadsCore();
  }, [cancelAllDownloadsCore, logAction]);

  const handleStartAllDownloads = useCallback(async () => {
    logAction("start-all", mediaList.length);
    await startAllDownloadsCore();
  }, [logAction, mediaList.length, startAllDownloadsCore]);

  const handleDownloadSelected = async (): Promise<void> => {
    const selectedIndices = getSelectedIndices(rowSelection);
    if (selectedIndices.length === 0) return;
    logAction("download-selected", selectedIndices.length);

    await startDownload({ indices: selectedIndices });
  };

  const handleRetryFailed = async (): Promise<void> => {
    const failedIndices = mediaList
      .map((item, idx) => (item.status === "Error" || item.status === "Cancelled" ? idx : -1))
      .filter((idx) => idx !== -1);

    if (failedIndices.length === 0) return;
    logAction("retry-failed", failedIndices.length);

    await startDownload({ indices: failedIndices });
  };

  const handleOpenInBrowser = async (): Promise<void> => {
    const selectedIndices = getSelectedIndices(rowSelection);
    if (selectedIndices.length === 0) return;

    for (const idx of selectedIndices) {
      const item = mediaList[idx];
      if (item?.url) {
        try {
          await tauriApi.shell.open(item.url);
        } catch (err) {
          console.error("Failed to open URL:", err);
        }
      }
    }
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
  const handleMediaInfo = ({ payload }: Event<MediaInfoEvent>): void => {
    const updates = mapMediaInfoEventToUpdate(payload);

    if (
      updates.collectionId &&
      updates.collectionType &&
      updates.collectionName &&
      updates.folderSlug
    ) {
      upsertCollections({
        id: updates.collectionId,
        kind: updates.collectionType,
        name: updates.collectionName,
        slug: updates.folderSlug,
      });
    }

    updateMediaItem(updates);
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

  const handleQueued = (event: Event<number>): void => {
    const mediaIdx = event.payload;
    updateMediaItemByIndex(mediaIdx, { status: "Pending", progress: 0 });
  };

  const handleStarted = (event: Event<number>): void => {
    const mediaIdx = event.payload;
    updateMediaItemByIndex(mediaIdx, { status: "Downloading" });
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
    [TAURI_EVENT.updateMediaInfo]: handleMediaInfo,
    [TAURI_EVENT.downloadProgress]: handleProgress,
    [TAURI_EVENT.downloadComplete]: handleComplete,
    [TAURI_EVENT.downloadError]: handleError,
    [TAURI_EVENT.downloadCancelled]: handleCancelled,
    [TAURI_EVENT.downloadQueued]: handleQueued,
    [TAURI_EVENT.downloadStarted]: handleStarted,
    [TAURI_EVENT.ytDlpStderr]: handleYtDlpStderr,
  });

  return (
    <main
      className="container"
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
    >
      <div className="app-container compact flex flex-col justify-between gap-y-4 h-screen">
        {/* Drop Zone - only expands when dragging */}
        <DropZone
          className={dragHovering ? "flex-1" : "shrink-0 py-2"}
          dropHandler={dropHandler}
          dragHovering={dragHovering}
        />

        {/* Media List with Context Menu */}
        <MediaListContextMenu
          onDownloadAll={handleStartAllDownloads}
          onDownloadSelected={handleDownloadSelected}
          onCancelAll={handleCancelAll}
          onPreviewSelected={preview}
          onRemoveSelected={handleRemoveSelected}
          onRemoveAll={handleRemoveAll}
          onRetryFailed={handleRetryFailed}
          onCopySelectedUrls={handleCopySelectedUrls}
          onCopyAllUrls={handleCopyAllUrls}
          onOpenInBrowser={handleOpenInBrowser}
          onShowDebugConsole={handleShowDebugConsole}
          hasSelection={Object.keys(rowSelection).length > 0}
          hasItems={mediaList.length > 0}
          hasFailed={mediaList.some(
            (item) => item.status === "Error" || item.status === "Cancelled",
          )}
        >
          <MediaTable className="flex-1 min-h-0" mediaList={mediaList} onRemoveItem={removeItem} />
        </MediaListContextMenu>

        {/* Download Controls */}
        <DownloadControls
          globalProgress={globalProgress}
          globalDownloading={globalDownloading}
          completedCount={completedCount}
          totalCount={totalCount}
          queuedCount={queueStats.queued}
          activeCount={queueStats.active}
          maxConcurrent={maxConcurrent}
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
