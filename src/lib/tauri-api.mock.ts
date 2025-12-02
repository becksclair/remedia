/**
 * Mock Tauri API Implementation for Testing
 *
 * Provides a fully functional mock of the Tauri API for use in tests.
 * Allows testing components without needing the actual Tauri runtime.
 */

import type { Event, EventCallback } from "@tauri-apps/api/event";
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
  TauriShell,
} from "./tauri-api";

/**
 * Mock-specific TauriWindow interface that extends the public interface
 * with test-only methods
 */
export interface MockTauriWindow extends TauriWindow {
  clearWindows(): void;
}
import type { DownloadSettings, PlaylistExpansion } from "@/types";
import { TAURI_EVENT } from "@/types";

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
    visible?: boolean;
  };
  private _visible: boolean;

  constructor(
    label: string,
    options: {
      url: string;
      width: number;
      height: number;
      title: string;
      visible?: boolean;
    },
  ) {
    this.label = label;
    this.options = options;
    // Initialize visibility from constructor option, defaulting to true
    this._visible = options.visible ?? true;
  }

  async once(event: string, handler: (data: unknown) => void): Promise<void> {
    // Simulate successful window creation
    if (event === "tauri://created") {
      setTimeout(() => handler({}), 10);
    }
  }

  async show(): Promise<void> {
    // Set window to visible state
    this._visible = true;
  }

  async hide(): Promise<void> {
    // Set window to hidden state
    this._visible = false;
  }

  async isVisible(): Promise<boolean> {
    // Return current visibility state
    return this._visible;
  }

  async setFocus(): Promise<void> {
    // No-op in tests; we only need this to satisfy usage in code paths
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

  // Pending timeouts for cleanup
  pendingTimers: new Set<ReturnType<typeof setTimeout>>(),

  // Download queue state
  queuedDownloads: [] as number[],
  maxConcurrentDownloads: 3,
  playlistExpansion: null as PlaylistExpansion | null,

  /**
   * Reset mock state between tests
   */
  reset(): void {
    this.commandCalls = [];
    this.activeDownloads.clear();

    // Clear all pending timeouts
    this.pendingTimers.forEach((timer) => clearTimeout(timer));
    this.pendingTimers.clear();

    this.clipboardContent = "";
    this.downloadDir = "/tmp/remedia-tests";
    this.isWayland = false;
    this.notificationPermission = "granted";
    this.dialogResult = null;
    this.queuedDownloads = [];
    this.maxConcurrentDownloads = 3;
    this.playlistExpansion = null;
    mockEventListeners.clear();
    (mockTauriApi.window as MockTauriWindow).clearWindows();
  },

  /**
   * Emit a mock event to all listeners
   */
  emitEvent<T>(event: string, payload: T): void {
    const listeners = mockEventListeners.get(event);
    if (listeners) {
      listeners.forEach((listener) => {
        const eventObj: Event<unknown> = {
          event,
          payload,
          id: -1,
        };
        listener(eventObj);
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
    subfolder: string | undefined,
    settings: DownloadSettings,
  ): Promise<void> {
    mockState.commandCalls.push({
      command: "download_media",
      args: { mediaIdx, mediaSourceUrl, outputLocation, subfolder, settings },
    });

    mockState.activeDownloads.add(mediaIdx);

    // Simulate download progress
    const progressSteps = [0, 25, 50, 75, 100];
    progressSteps.forEach((progress, index) => {
      const timerId = setTimeout(() => {
        mockState.pendingTimers.delete(timerId);
        if (mockState.activeDownloads.has(mediaIdx)) {
          mockState.emitEvent(TAURI_EVENT.downloadProgress, [mediaIdx, progress]);

          if (progress === 100) {
            mockState.activeDownloads.delete(mediaIdx);
            mockState.emitEvent(TAURI_EVENT.downloadComplete, mediaIdx);
          }
        }
      }, index * 100);
      mockState.pendingTimers.add(timerId);
    });
  }

  async cancelAllDownloads(): Promise<void> {
    mockState.commandCalls.push({
      command: "cancel_all_downloads",
      args: {},
    });

    // Cancel all active downloads
    mockState.activeDownloads.forEach((mediaIdx) => {
      mockState.emitEvent(TAURI_EVENT.downloadCancelled, mediaIdx);
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

  async expandPlaylist(mediaSourceUrl: string): Promise<PlaylistExpansion> {
    mockState.commandCalls.push({
      command: "expand_playlist",
      args: { mediaSourceUrl },
    });

    if (mockState.playlistExpansion) {
      return mockState.playlistExpansion;
    }

    // Default mock response: return empty to signal non-playlist
    return { entries: [] };
  }
}

/**
 * Mock Events Implementation
 */
class MockEvents implements TauriEvents {
  async listen<T>(event: string, handler: EventCallback<T>): Promise<() => void> {
    if (!mockEventListeners.has(event)) {
      mockEventListeners.set(event, new Set());
    }

    const listeners = mockEventListeners.get(event)!;

    // Adapter to convert generic Event<unknown> to Event<T> for the handler
    const adapter: EventCallback<unknown> = (e) => {
      handler(e as Event<T>);
    };

    listeners.add(adapter);

    // Return unlisten function
    return () => {
      listeners.delete(adapter);
    };
  }
}

/**
 * Mock Window Implementation
 */
class MockWindow implements MockTauriWindow {
  private windows = new Map<string, WebviewWindow>();

  createWindow(
    label: string,
    options: {
      url: string;
      width: number;
      height: number;
      title: string;
      visible?: boolean;
    },
  ): WebviewWindow {
    const window = new MockWebviewWindow(label, options) as unknown as WebviewWindow;
    this.windows.set(label, window);
    return window;
  }

  async getWindow(label: string): Promise<WebviewWindow | null> {
    return this.windows.get(label) ?? null;
  }

  clearWindows(): void {
    this.windows.clear();
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
 * Mock Shell Implementation
 */
class MockShell implements TauriShell {
  async open(url: string): Promise<void> {
    mockState.commandCalls.push({
      command: "open_url",
      args: { url },
    });
  }
}

/**
 * Complete Mock Tauri API
 */
export class MockTauriApi implements TauriApi {
  commands: TauriCommands = new MockCommands();
  events: TauriEvents = new MockEvents();
  window: MockTauriWindow = new MockWindow();
  path: TauriPath = new MockPath();
  clipboard: TauriClipboard = new MockClipboard();
  notification: TauriNotification = new MockNotification();
  dialog: TauriDialog = new MockDialog();
  shell: TauriShell = new MockShell();
}

/**
 * Default mock instance
 */
export const mockTauriApi = new MockTauriApi();
