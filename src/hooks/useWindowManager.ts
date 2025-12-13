/**
 * Window management hook for atomic, idempotent window creation.
 *
 * This hook extracts window management logic from App.tsx into a reusable,
 * testable abstraction. It handles:
 * - Atomic window creation (prevents race conditions)
 * - Window reuse when already exists
 * - Promise locks to prevent concurrent creation attempts
 */

import { useCallback, useRef } from "react";
import type { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { useTauriApi } from "@/lib/TauriApiContext";

export interface WindowOptions {
  url: string;
  width: number;
  height: number;
  title: string;
  visible?: boolean;
}

export interface UseWindowManagerReturn {
  /**
   * Create or retrieve a window atomically.
   * If the window already exists, it will be shown and focused.
   * If creation is already in progress, waits for that to complete.
   */
  createWindow: (label: string, options: WindowOptions) => Promise<WebviewWindow>;

  /**
   * Show and focus an existing window by label.
   * Returns null if window doesn't exist.
   */
  showWindow: (label: string) => Promise<WebviewWindow | null>;
}

/**
 * Hook for managing Tauri windows with atomic creation semantics.
 *
 * Prevents race conditions by:
 * 1. Checking if window already exists before creation
 * 2. Using promise locks to serialize concurrent creation attempts
 * 3. Cleaning up locks on success or failure
 *
 * @example
 * ```tsx
 * const { createWindow } = useWindowManager();
 *
 * const showDebugConsole = async () => {
 *   await createWindow("debug-console", {
 *     url: "/debug",
 *     width: 800,
 *     height: 600,
 *     title: "Debug Console"
 *   });
 * };
 * ```
 */
export function useWindowManager(): UseWindowManagerReturn {
  const tauriApi = useTauriApi();

  // Shared promise locks to prevent race conditions during window creation
  const windowCreationLocks = useRef<Map<string, Promise<WebviewWindow>>>(new Map());

  const showWindow = useCallback(
    async (label: string): Promise<WebviewWindow | null> => {
      const existing = await tauriApi.window.getWindow(label);
      if (existing) {
        await existing.show();
        await existing.setFocus();
        return existing;
      }
      return null;
    },
    [tauriApi],
  );

  const createWindow = useCallback(
    async (label: string, options: WindowOptions): Promise<WebviewWindow> => {
      // Check if window already exists
      const existing = await tauriApi.window.getWindow(label);
      if (existing) {
        console.log(`[WindowManager] Window '${label}' already exists, showing and focusing`);
        await existing.show();
        await existing.setFocus();
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
          console.log(`[WindowManager] Creating window '${label}' with URL '${options.url}'`);
          const window = tauriApi.window.createWindow(label, options);

          // Wait for window to be ready, then show and focus if not explicitly hidden
          if (options.visible !== false) {
            await window.show();
            await window.setFocus();
          }

          console.log(`[WindowManager] Successfully created window '${label}'`);
          // Resolve BEFORE deleting lock to ensure atomicity
          resolveCreation(window);
          windowCreationLocks.current.delete(label);
        } catch (error) {
          // Treat "already exists" errors as success
          if (error instanceof Error && error.message.includes("already exists")) {
            const retryWindow = await tauriApi.window.getWindow(label);
            if (retryWindow) {
              console.log(
                `[WindowManager] Retrieved existing window '${label}' after creation conflict`,
              );
              // Resolve BEFORE deleting lock to ensure atomicity
              resolveCreation(retryWindow);
              windowCreationLocks.current.delete(label);
              return;
            }
          }
          console.error(`[WindowManager] Failed to create window '${label}':`, error);
          // Reject BEFORE deleting lock to ensure atomicity
          rejectCreation(error as Error);
          windowCreationLocks.current.delete(label);
        }
      })();

      return await sentinelPromise;
    },
    [tauriApi],
  );

  return {
    createWindow,
    showWindow,
  };
}
