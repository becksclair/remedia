/**
 * Mock Tauri API Implementation for Testing
 *
 * Provides a fully functional mock of the Tauri API for use in tests.
 * Allows testing components without needing the actual Tauri runtime.
 */

import type { EventCallback } from "@tauri-apps/api/event";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import type {
  TauriApi,
  TauriCommands,
  TauriEvents,
  TauriWindow,
  TauriPath,
  TauriClipboard,
  TauriNotification,
  TauriDialog,
} from "./tauri-api";
import type { DownloadSettings } from "@/types";

/**
 * Mock event listeners registry
 */
const mockEventListeners = new Map<string, Set<EventCallback<unknown>>>();

/**
 * Mock WebviewWindow class
 */
class MockWebviewWindow {
  label: string;
  options: {
    url: string;
    width: number;
    height: number;
    title: string;
  };

  constructor(
    label: string,
    options: {
      url: string;
      width: number;
      height: number;
      title: string;
    },
  ) {
    this.label = label;
    this.options = options;
  }

  async once(event: string, handler: (data: unknown) => void): Promise<void> {
    // Simulate successful window creation
    if (event === "tauri://created") {
      setTimeout(() => handler({}), 10);
    }
  }
}

/**
 * Mock state for testing
 */
export const mockState = {
  // Command call history
  commandCalls: [] as { command: string; args: unknown }[],

  // Simulated downloads
  activeDownloads: new Set<number>(),

  // Simulated clipboard
  clipboardContent: "",

  // Simulated download directory
  downloadDir: "/tmp/remedia-tests",

  // Simulated Wayland state
  isWayland: false,

  // Simulated notification permission
  notificationPermission: "granted" as "granted" | "denied" | "default",

  // Simulated dialog result
  dialogResult: null as string | string[] | null,

  // Download queue state
  queuedDownloads: [] as number[],
  maxConcurrentDownloads: 3,

  /**
   * Reset mock state between tests
   */
  reset(): void {
    this.commandCalls = [];
    this.activeDownloads.clear();
    this.clipboardContent = "";
    this.downloadDir = "/tmp/remedia-tests";
    this.isWayland = false;
    this.notificationPermission = "granted";
    this.dialogResult = null;
    this.queuedDownloads = [];
    this.maxConcurrentDownloads = 3;
    mockEventListeners.clear();
  },

  /**
   * Emit a mock event to all listeners
   */
  emitEvent<T>(event: string, payload: T): void {
    const listeners = mockEventListeners.get(event);
    if (listeners) {
      listeners.forEach((listener) => {
        listener({ event, payload } as never);
      });
    }
  },
};

/**
 * Mock Commands Implementation
 */
class MockCommands implements TauriCommands {
  async getMediaInfo(mediaIdx: number, mediaSourceUrl: string): Promise<void> {
    mockState.commandCalls.push({
      command: "get_media_info",
      args: { mediaIdx, mediaSourceUrl },
    });
    // Do not auto-emit metadata; tests inject events explicitly
  }

  async downloadMedia(
    mediaIdx: number,
    mediaSourceUrl: string,
    outputLocation: string,
    settings: DownloadSettings,
  ): Promise<void> {
    mockState.commandCalls.push({
      command: "download_media",
      args: { mediaIdx, mediaSourceUrl, outputLocation, settings },
    });

    mockState.activeDownloads.add(mediaIdx);

    // Simulate download progress
    const progressSteps = [0, 25, 50, 75, 100];
    progressSteps.forEach((progress, index) => {
      setTimeout(() => {
        if (mockState.activeDownloads.has(mediaIdx)) {
          mockState.emitEvent("download-progress", [mediaIdx, progress]);

          if (progress === 100) {
            mockState.activeDownloads.delete(mediaIdx);
            mockState.emitEvent("download-complete", mediaIdx);
          }
        }
      }, index * 100);
    });
  }

  async cancelAllDownloads(): Promise<void> {
    mockState.commandCalls.push({
      command: "cancel_all_downloads",
      args: {},
    });

    // Cancel all active downloads
    mockState.activeDownloads.forEach((mediaIdx) => {
      mockState.emitEvent("download-cancelled", mediaIdx);
    });
    mockState.activeDownloads.clear();
  }

  async setMaxConcurrentDownloads(maxConcurrent: number): Promise<void> {
    mockState.commandCalls.push({
      command: "set_max_concurrent_downloads",
      args: { maxConcurrent },
    });
    mockState.maxConcurrentDownloads = maxConcurrent;
  }

  async getQueueStatus(): Promise<[number, number, number]> {
    mockState.commandCalls.push({
      command: "get_queue_status",
      args: {},
    });
    // Return [queued, active, max_concurrent]
    const queued = mockState.queuedDownloads.length;
    const active = mockState.activeDownloads.size;
    const maxConcurrent = mockState.maxConcurrentDownloads;
    return [queued, active, maxConcurrent];
  }

  async quit(): Promise<void> {
    mockState.commandCalls.push({
      command: "quit",
      args: {},
    });
  }

  async isWayland(): Promise<boolean> {
    mockState.commandCalls.push({
      command: "is_wayland",
      args: {},
    });
    return mockState.isWayland;
  }

  async setAlwaysOnTop(alwaysOnTop: boolean): Promise<void> {
    mockState.commandCalls.push({
      command: "set_always_on_top",
      args: { alwaysOnTop },
    });
  }
}

/**
 * Mock Events Implementation
 */
class MockEvents implements TauriEvents {
  async listen<T>(
    event: string,
    handler: EventCallback<T>,
  ): Promise<() => void> {
    if (!mockEventListeners.has(event)) {
      mockEventListeners.set(event, new Set());
    }

    const listeners = mockEventListeners.get(event)!;
    listeners.add(handler as EventCallback<unknown>);

    // Return unlisten function
    return () => {
      listeners.delete(handler as EventCallback<unknown>);
    };
  }
}

/**
 * Mock Window Implementation
 */
class MockWindow implements TauriWindow {
  createWindow(
    label: string,
    options: {
      url: string;
      width: number;
      height: number;
      title: string;
    },
  ): WebviewWindow {
    return new MockWebviewWindow(label, options) as unknown as WebviewWindow;
  }
}

/**
 * Mock Path Implementation
 */
class MockPath implements TauriPath {
  async getDownloadDir(): Promise<string> {
    return mockState.downloadDir;
  }
}

/**
 * Mock Clipboard Implementation
 */
class MockClipboard implements TauriClipboard {
  async readText(): Promise<string> {
    return mockState.clipboardContent;
  }

  async writeText(text: string): Promise<void> {
    mockState.clipboardContent = text;
  }
}

/**
 * Mock Notification Implementation
 */
class MockNotification implements TauriNotification {
  async isPermissionGranted(): Promise<boolean> {
    return mockState.notificationPermission === "granted";
  }

  async requestPermission(): Promise<string> {
    return mockState.notificationPermission;
  }

  sendNotification(options: { title: string; body: string }): void {
    mockState.commandCalls.push({
      command: "send_notification",
      args: options,
    });
  }
}

/**
 * Mock Dialog Implementation
 */
class MockDialog implements TauriDialog {
  async open(options: {
    defaultPath?: string;
    directory?: boolean;
    multiple?: boolean;
    title?: string;
  }): Promise<string | string[] | null> {
    mockState.commandCalls.push({
      command: "open_dialog",
      args: options,
    });
    return mockState.dialogResult;
  }
}

/**
 * Complete Mock Tauri API
 */
export class MockTauriApi implements TauriApi {
  commands: TauriCommands = new MockCommands();
  events: TauriEvents = new MockEvents();
  window: TauriWindow = new MockWindow();
  path: TauriPath = new MockPath();
  clipboard: TauriClipboard = new MockClipboard();
  notification: TauriNotification = new MockNotification();
  dialog: TauriDialog = new MockDialog();
}

/**
 * Default mock instance
 */
export const mockTauriApi = new MockTauriApi();
