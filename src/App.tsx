/**
 * Main Application Component (Refactored)
 *
 * Orchestrates the main media downloader interface.
 * Now uses extracted components and hooks for better maintainability.
 */

import { useEffect, useState } from "react";
import type { JSX } from "react";
import type { Event } from "@tauri-apps/api/event";

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

// State
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { downloadLocationAtom } from "@/state/settings-atoms";
import { tableRowSelectionAtom, addLogEntryAtom } from "@/state/app-atoms";

// Utils
import {
  isValidUrl,
  clampProgress,
  getSelectedIndices,
} from "@/utils/media-helpers";
import {
  DRAG_HOVER_DEBOUNCE_MS,
  DEBUG_CONSOLE_WIDTH,
  DEBUG_CONSOLE_HEIGHT,
  PREVIEW_WINDOW_WIDTH,
  PREVIEW_WINDOW_HEIGHT,
} from "@/utils/constants";

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

  // Local state
  const [notificationPermission, setNotificationPermission] = useState(false);
  const [dragHovering, setDragHovering] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

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

  const {
    globalProgress,
    globalDownloading,
    startDownload,
    cancelAllDownloads,
  } = useDownloadManager(mediaList);

  /**
   * Request notification permissions
   */
  useEffect(() => {
    void tauriApi.notification.isPermissionGranted().then((granted) => {
      if (!granted) {
        console.log("Requesting notification permission");
        void tauriApi.notification.requestPermission().then((permission) => {
          console.log("Notification permission:", permission);
          setNotificationPermission(permission === "granted");
        });
      } else {
        console.log("Notification permission already granted:", granted);
        setNotificationPermission(granted);
      }
    });
  }, [tauriApi.notification]);

  /**
   * Set default download directory
   */
  useEffect(() => {
    if (outputLocation) return;

    tauriApi.path
      .getDownloadDir()
      .then((dir) => setOutputLocation(dir))
      .catch((error) => {
        console.error("Failed to get download directory:", error);
      });
  }, [tauriApi.path, outputLocation, setOutputLocation]);

  /**
   * Expose test helper for E2E tests
   */
  useEffect(() => {
    if (
      typeof window !== "undefined" &&
      (process.env.NODE_ENV === "test" ||
        process.env.NODE_ENV === "development")
    ) {
      window.__E2E_addUrl = (url: string) => {
        if (/^https?:\/\/[^\s]{3,2000}$/.test(url)) addMediaUrl(url);
      };
    }
  }, [addMediaUrl]);

  /**
   * Check clipboard for URLs on window focus
   */
  const handleWindowFocus = () => {
    tauriApi.clipboard
      .readText()
      .then((text) => {
        if (isValidUrl(text)) {
          addMediaUrl(text);
          console.log("URL added from clipboard");
        }
      })
      .catch((err) => {
        console.log("Error reading clipboard:", err);
      });
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
   * Preview selected media
   */
  async function preview(): Promise<void> {
    const selectedRowIndices = getSelectedIndices(rowSelection);

    if (selectedRowIndices.length === 0) {
      alert("Please select one or more items to preview");
      return;
    }

    console.log("Selected rows for preview:", selectedRowIndices);

    try {
      for (const rowIndex of selectedRowIndices) {
        const selectedItem = mediaList[rowIndex];
        if (selectedItem?.url) {
          console.log(`Opening preview for item ${rowIndex}:`, selectedItem);

          const win = tauriApi.window.createWindow("preview-win", {
            url: `/player?url=${encodeURIComponent(selectedItem.url)}`,
            width: PREVIEW_WINDOW_WIDTH,
            height: PREVIEW_WINDOW_HEIGHT,
            title: selectedItem.title
              ? `Preview: ${selectedItem.title}`
              : "ReMedia Preview",
          });

          void (win as any).once("tauri://created", () => {
            // webview successfully created
          });
          void (win as any).once("tauri://error", (error: unknown) => {
            console.error("Error creating webview:", error);
          });
        } else {
          console.warn(`No URL found for selected item at index ${rowIndex}`);
        }
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
    try {
      await navigator.clipboard.writeText(urls);

      if (notificationPermission) {
        tauriApi.notification.sendNotification({
          body: `Copied ${mediaList.length} URL(s) to clipboard`,
          title: "ReMedia",
        });
      }
    } catch (error) {
      console.error("Failed to copy URLs:", error);
    }
  };

  const handleShowDebugConsole = async (): Promise<void> => {
    try {
      const debugWindow = tauriApi.window.createWindow("debug-console", {
        url: "/debug",
        width: DEBUG_CONSOLE_WIDTH,
        height: DEBUG_CONSOLE_HEIGHT,
        title: "ReMedia Debug Console",
      });

      void (debugWindow as any).once("tauri://created", () => {
        console.log("Debug console window created");
      });

      void (debugWindow as any).once("tauri://error", (error: unknown) => {
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
    payload: [_mediaIdx, mediaSourceUrl, title, thumbnail],
  }: Event<MediaInfoEvent>): void => {
    updateMediaItem({ thumbnail, title, url: mediaSourceUrl });
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

  const handleYtDlpStderr = (event: Event<[number, string]>): void => {
    const [mediaIdx, message] = event.payload;
    console.log(`[yt-dlp stderr][media ${mediaIdx}]: ${message}`);
    addLogEntry({
      timestamp: Date.now(),
      source: "yt-dlp",
      level: message.toLowerCase().includes("error")
        ? "error"
        : message.toLowerCase().includes("warn")
          ? "warn"
          : "info",
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
    "yt-dlp-stderr": handleYtDlpStderr,
  });

  return (
    <main
      className="container"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
    >
      <div className="app-container compact flex flex-col justify-between gap-y-4 h-screen">
        {/* Drop Zone */}
        <DropZone
          className="flex-auto grow overflow-y-auto"
          dropHandler={dropHandler}
          dragHovering={dragHovering}
        />

        {/* Media List with Context Menu */}
        <MediaListContextMenu
          onDownloadAll={startDownload}
          onCancelAll={cancelAllDownloads}
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
          onDownload={startDownload}
          onCancel={cancelAllDownloads}
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
