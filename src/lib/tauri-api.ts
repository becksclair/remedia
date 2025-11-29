/**
 * Tauri API Abstraction Layer
 *
 * This module provides a testable abstraction over Tauri APIs.
 * All Tauri-specific imports are centralized here, making it easy to mock for testing.
 */

import { invoke as tauriInvoke } from "@tauri-apps/api/core";
import type { EventCallback } from "@tauri-apps/api/event";
import { listen } from "@tauri-apps/api/event";
import { downloadDir } from "@tauri-apps/api/path";
import { readText, writeText } from "@tauri-apps/plugin-clipboard-manager";
import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
} from "@tauri-apps/plugin-notification";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { openUrl } from "@tauri-apps/plugin-opener";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import type { DownloadSettings, PlaylistExpansion } from "@/types";

/**
 * Tauri Command API
 */
export interface TauriCommands {
  /**
   * Request media information (metadata) for a URL
   */
  getMediaInfo(mediaIdx: number, mediaSourceUrl: string): Promise<void>;

  /**
   * Expand playlist/profile URLs into concrete media URLs with metadata
   */
  expandPlaylist(mediaSourceUrl: string): Promise<PlaylistExpansion>;

  /**
   * Download media from a URL
   */
  downloadMedia(
    mediaIdx: number,
    mediaSourceUrl: string,
    outputLocation: string,
    subfolder: string | undefined,
    settings: DownloadSettings,
  ): Promise<void>;

  /**
   * Cancel all active downloads
   */
  cancelAllDownloads(): Promise<void>;

  /**
   * Set maximum number of concurrent downloads
   */
  setMaxConcurrentDownloads(maxConcurrent: number): Promise<void>;

  /**
   * Get current queue status (queued, active, max_concurrent)
   */
  getQueueStatus(): Promise<[number, number, number]>;

  /**
   * Quit the application
   */
  quit(): Promise<void>;

  /**
   * Check if running on Wayland
   */
  isWayland(): Promise<boolean>;

  /**
   * Set window always-on-top behavior
   */
  setAlwaysOnTop(alwaysOnTop: boolean): Promise<void>;
}

/**
 * Tauri Event API
 */
export interface TauriEvents {
  /**
   * Listen to a Tauri event
   */
  listen<T>(event: string, handler: EventCallback<T>): Promise<() => void>;
}

/**
 * Tauri Window API
 */
export interface TauriWindow {
  /**
   * Create a new webview window
   */
  createWindow(
    label: string,
    options: {
      url: string;
      width: number;
      height: number;
      title: string;
    },
  ): WebviewWindow;
}

/**
 * Tauri Path API
 */
export interface TauriPath {
  /**
   * Get the user's download directory
   */
  getDownloadDir(): Promise<string>;
}

/**
 * Tauri Clipboard API
 */
export interface TauriClipboard {
  /**
   * Read text from clipboard
   */
  readText(): Promise<string>;

  /**
   * Write text to clipboard
   */
  writeText(text: string): Promise<void>;
}

/**
 * Tauri Notification API
 */
export interface TauriNotification {
  /**
   * Check if notification permission is granted
   */
  isPermissionGranted(): Promise<boolean>;

  /**
   * Request notification permission
   */
  requestPermission(): Promise<string>;

  /**
   * Send a notification
   */
  sendNotification(options: { title: string; body: string }): void;
}

/**
 * Tauri Dialog API
 */
export interface TauriDialog {
  /**
   * Open a file/directory selection dialog
   */
  open(options: {
    defaultPath?: string;
    directory?: boolean;
    multiple?: boolean;
    title?: string;
  }): Promise<string | string[] | null>;
}

/**
 * Tauri Shell API
 */
export interface TauriShell {
  /**
   * Open a URL in the default browser
   */
  open(url: string): Promise<void>;
}

/**
 * Complete Tauri API interface
 */
export interface TauriApi {
  commands: TauriCommands;
  events: TauriEvents;
  window: TauriWindow;
  path: TauriPath;
  clipboard: TauriClipboard;
  notification: TauriNotification;
  dialog: TauriDialog;
  shell: TauriShell;
}

/**
 * Real Tauri API implementation
 */
class RealTauriApi implements TauriApi {
  commands: TauriCommands = {
    async getMediaInfo(mediaIdx: number, mediaSourceUrl: string): Promise<void> {
      await tauriInvoke("get_media_info", { mediaIdx, mediaSourceUrl });
    },

    async expandPlaylist(mediaSourceUrl: string): Promise<PlaylistExpansion> {
      return await tauriInvoke<PlaylistExpansion>("expand_playlist", { mediaSourceUrl });
    },

    async downloadMedia(
      mediaIdx: number,
      mediaSourceUrl: string,
      outputLocation: string,
      subfolder: string | undefined,
      settings: DownloadSettings,
    ): Promise<void> {
      await tauriInvoke("download_media", {
        mediaIdx,
        mediaSourceUrl,
        outputLocation,
        subfolder,
        settings,
      });
    },

    async cancelAllDownloads(): Promise<void> {
      await tauriInvoke("cancel_all_downloads");
    },

    async setMaxConcurrentDownloads(maxConcurrent: number): Promise<void> {
      await tauriInvoke("set_max_concurrent_downloads", { maxConcurrent });
    },

    async getQueueStatus(): Promise<[number, number, number]> {
      const result = await tauriInvoke<[number, number, number]>("get_queue_status");
      return result;
    },

    async quit(): Promise<void> {
      await tauriInvoke("quit");
    },

    async isWayland(): Promise<boolean> {
      const result = await tauriInvoke("is_wayland");
      return Boolean(result);
    },

    async setAlwaysOnTop(alwaysOnTop: boolean): Promise<void> {
      await tauriInvoke("set_always_on_top", { alwaysOnTop });
    },
  };

  events: TauriEvents = {
    async listen<T>(event: string, handler: EventCallback<T>): Promise<() => void> {
      return await listen(event, handler);
    },
  };

  window: TauriWindow = {
    createWindow(
      label: string,
      options: {
        url: string;
        width: number;
        height: number;
        title: string;
      },
    ): WebviewWindow {
      return new WebviewWindow(label, options);
    },
  };

  path: TauriPath = {
    async getDownloadDir(): Promise<string> {
      return await downloadDir();
    },
  };

  clipboard: TauriClipboard = {
    async readText(): Promise<string> {
      return await readText();
    },

    async writeText(text: string): Promise<void> {
      await writeText(text);
    },
  };

  notification: TauriNotification = {
    async isPermissionGranted(): Promise<boolean> {
      return await isPermissionGranted();
    },

    async requestPermission(): Promise<string> {
      return await requestPermission();
    },

    sendNotification(options: { title: string; body: string }): void {
      sendNotification(options);
    },
  };

  dialog: TauriDialog = {
    async open(options: {
      defaultPath?: string;
      directory?: boolean;
      multiple?: boolean;
      title?: string;
    }): Promise<string | string[] | null> {
      return await openDialog(options);
    },
  };

  shell: TauriShell = {
    async open(url: string): Promise<void> {
      await openUrl(url);
    },
  };
}

/**
 * Default Tauri API instance
 */
export const tauriApi: TauriApi = new RealTauriApi();
