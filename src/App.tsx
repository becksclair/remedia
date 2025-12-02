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

  // Debug: expose mediaList on window for remote harness inspection
  if (import.meta.env.DEV) {
    (window as unknown as { __DEBUG_MEDIA_LIST?: typeof mediaList }).__DEBUG_MEDIA_LIST = mediaList;
  }
  const { globalProgress, globalDownloading, startDownload, cancelAllDownloads } =
    useDownloadManager(mediaList);
  const { queueStats, refreshQueueStatus } = useQueueStatus();
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

  // Shared promise locks to prevent race conditions during window creation
  const windowCreationLocks = useRef<Map<string, Promise<WebviewWindow>>>(new Map());

  /**
   * Atomic, idempotent window creation helper.
   * Ensures only one creation attempt runs at a time per window label.
   */
  const createWindowAtomic = useCallback(
    async (
      label: string,
      options: { url: string; width: number; height: number; title: string; visible?: boolean },
    ): Promise<WebviewWindow> => {
      // Check if window already exists
      const existing = await tauriApi.window.getWindow(label);
      if (existing) {
        return existing;
      }

      // Check if there's an ongoing creation attempt
      const existingLock = windowCreationLocks.current.get(label);
      if (existingLock) {
        try {
          return await existingLock;
        } catch {
          // If the previous attempt failed, remove the lock and try again
          windowCreationLocks.current.delete(label);
        }
      }

      // Set a sentinel promise immediately to prevent concurrent creation attempts
      // Initialize with no-op functions to satisfy TypeScript
      let resolveCreation: (window: WebviewWindow) => void = () => {};
      let rejectCreation: (error: Error) => void = () => {};

      const sentinelPromise = new Promise<WebviewWindow>((resolve, reject) => {
        resolveCreation = resolve;
        rejectCreation = reject;
      });

      // Store the sentinel lock before any async operations
      windowCreationLocks.current.set(label, sentinelPromise);

      // Execute the actual window creation
      void (async () => {
        try {
          const window = tauriApi.window.createWindow(label, options);
          resolveCreation(window);
        } catch (error) {
          // Treat "already exists" errors as success
          if (error instanceof Error && error.message.includes("already exists")) {
            const retryWindow = await tauriApi.window.getWindow(label);
            if (retryWindow) {
              resolveCreation(retryWindow);
              return;
            }
          }
          rejectCreation(error as Error);
        } finally {
          // Clean up the lock regardless of outcome
          windowCreationLocks.current.delete(label);
        }
      })();

      return await sentinelPromise;
    },
    [tauriApi],
  );

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
   * Preload the settings window in Tauri so it can be shown quickly later.
   * The window is created hidden and only shown when the user opens settings.
   * Uses atomic creation to prevent race conditions.
   */
  useEffect(() => {
    if (!isTauriRuntime()) return;

    void (async () => {
      try {
        await createWindowAtomic("settings", {
          url: "/settings",
          width: 600,
          height: 700,
          title: "ReMedia Settings",
          visible: false,
        });
      } catch (error) {
        console.error("Failed to preload settings window:", error);
      }
    })();
  }, [createWindowAtomic]);

  /**
   * Preload the debug console window in Tauri so it can be shown quickly later.
   * Uses atomic creation to prevent race conditions.
   */
  useEffect(() => {
    if (!isTauriRuntime()) return;

    void (async () => {
      try {
        await createWindowAtomic("debug-console", {
          url: "/debug",
          width: DEBUG_CONSOLE_WIDTH,
          height: DEBUG_CONSOLE_HEIGHT,
          title: "ReMedia Debug Console",
          visible: false,
        });
      } catch (error) {
        console.error("Failed to preload debug console window:", error);
      }
    })();
  }, [createWindowAtomic]);

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
   * Sync max concurrent downloads setting to backend on mount and when it changes.
   * - Immediate sync on mount (before any downloads can start)
   * - Debounced for subsequent changes to avoid spamming backend
   */
  const initialSyncDoneRef = useRef(false);
  useEffect(() => {
    if (!isTauriRuntime()) return;

    const syncToBackend = async () => {
      try {
        await tauriApi.commands.setMaxConcurrentDownloads(maxConcurrent);
        await refreshQueueStatus();
      } catch (error) {
        console.error("Failed to sync max concurrent downloads:", error);
      }
    };

    // Immediate sync on mount, debounced for subsequent changes
    if (!initialSyncDoneRef.current) {
      initialSyncDoneRef.current = true;
      void syncToBackend();
      return;
    }

    const timeoutId = setTimeout(() => {
      void syncToBackend();
    }, 150);

    return () => clearTimeout(timeoutId);
  }, [tauriApi.commands, maxConcurrent, refreshQueueStatus]);

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
      const debugWindow = await createWindowAtomic("debug-console", {
        url: "/debug",
        width: DEBUG_CONSOLE_WIDTH,
        height: DEBUG_CONSOLE_HEIGHT,
        title: "ReMedia Debug Console",
      });

      await debugWindow.show();
      await debugWindow.setFocus();
    } catch (error) {
      console.error("Failed to open debug console:", error);
    }
  };

  const handleShowSettingsWindow = async (): Promise<void> => {
    try {
      const settingsWindow = await createWindowAtomic("settings", {
        url: "/settings",
        width: 600,
        height: 700,
        title: "ReMedia Settings",
      });

      await settingsWindow.show();
      await settingsWindow.setFocus();
    } catch (error) {
      console.error("Failed to show settings window:", error);
    }
  };

  /**
   * Tauri event handlers - wrapped in useCallback to prevent dependency issues
   */
  const handleMediaInfo = useCallback(
    ({ payload }: Event<MediaInfoEvent>): void => {
      const updates = mapMediaInfoEventToUpdate(payload);

      // Mirror media-info updates into the debug console so thumbnail decisions are visible.
      try {
        const [, mediaSourceUrl, title, thumbnail] = payload;
        addLogEntry({
          timestamp: Date.now(),
          source: "app",
          level: "info",
          message: `media-info: url=${mediaSourceUrl} title=${title} thumbnail=${thumbnail}`,
        });
      } catch {
        // Best-effort logging only; ignore errors
      }

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
    },
    [addLogEntry, updateMediaItem, upsertCollections],
  );

  const handleProgress = useCallback(
    (event: Event<MediaProgressEvent>): void => {
      const [mediaIdx, progress] = event.payload as MediaProgressEvent;
      updateMediaItemByIndex(mediaIdx, {
        progress: clampProgress(progress),
        status: "Downloading",
      });
    },
    [updateMediaItemByIndex],
  );

  const handleComplete = useCallback(
    (event: Event<number>): void => {
      const mediaIdx = event.payload;
      updateMediaItemByIndex(mediaIdx, { progress: 100, status: "Done" });
    },
    [updateMediaItemByIndex],
  );

  const handleError = useCallback(
    (event: Event<number>): void => {
      const mediaIdx = event.payload;
      updateMediaItemByIndex(mediaIdx, { status: "Error" });
    },
    [updateMediaItemByIndex],
  );

  const handleCancelled = useCallback(
    (event: Event<number>): void => {
      const mediaIdx = event.payload;
      updateMediaItemByIndex(mediaIdx, { status: "Cancelled" });
    },
    [updateMediaItemByIndex],
  );

  const handleQueued = useCallback(
    (event: Event<number>): void => {
      const mediaIdx = event.payload;
      updateMediaItemByIndex(mediaIdx, { status: "Pending", progress: 0 });
    },
    [updateMediaItemByIndex],
  );

  const handleStarted = useCallback(
    (event: Event<number>): void => {
      const mediaIdx = event.payload;
      updateMediaItemByIndex(mediaIdx, { status: "Downloading" });
    },
    [updateMediaItemByIndex],
  );

  const handleYtDlpStderr = useCallback(
    (event: Event<[number, string]>): void => {
      const [mediaIdx, message] = event.payload;
      if (harnessEnabled) {
        console.log(`[yt-dlp stderr][media ${mediaIdx}]: ${message}`);
      }

      // Normalize case once for robust log-level detection
      const messageLower = message.toLowerCase();

      // Determine log level using canonical prefixes and word-boundary regex
      let level: "error" | "warn" | "info" = "info";

      // Check canonical log prefixes first (most reliable)
      if (
        message.startsWith("ERROR") ||
        message.startsWith("Error") ||
        message.startsWith("error")
      ) {
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
    },
    [addLogEntry, harnessEnabled],
  );

  // Memoize event handlers object to prevent useEffect loop in useTauriEvents
  const tauriEventHandlers = useMemo(
    () => ({
      [TAURI_EVENT.updateMediaInfo]: handleMediaInfo,
      [TAURI_EVENT.downloadProgress]: handleProgress,
      [TAURI_EVENT.downloadComplete]: handleComplete,
      [TAURI_EVENT.downloadError]: handleError,
      [TAURI_EVENT.downloadCancelled]: handleCancelled,
      [TAURI_EVENT.downloadQueued]: handleQueued,
      [TAURI_EVENT.downloadStarted]: handleStarted,
      [TAURI_EVENT.ytDlpStderr]: handleYtDlpStderr,
    }),
    [
      handleMediaInfo,
      handleProgress,
      handleComplete,
      handleError,
      handleCancelled,
      handleQueued,
      handleStarted,
      handleYtDlpStderr,
    ],
  );

  // Subscribe to Tauri events
  useTauriEvents(tauriEventHandlers);

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
          maxConcurrent={queueStats.maxConcurrent}
          onDownload={handleStartAllDownloads}
          onCancel={handleCancelAll}
          onPreview={preview}
          onSettings={handleShowSettingsWindow}
          onQuit={() => tauriApi.commands.quit()}
        />
      </div>
    </main>
  );
}

export default App;
