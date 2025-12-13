/**
 * Clipboard monitoring hook for auto-importing URLs.
 *
 * This hook extracts clipboard monitoring logic from App.tsx into a reusable,
 * testable abstraction. It handles:
 * - Monitoring clipboard on window focus
 * - Skipping clipboard check after drag-drop events
 * - Validating and importing URLs
 */

import { useCallback, useRef } from "react";
import { useAtomValue, useSetAtom } from "jotai";
import { clipboardAutoImportAtom } from "@/state/settings-atoms";
import { addLogEntryAtom, type LogEntry } from "@/state/app-atoms";
import { useWindowFocus } from "@/hooks/use-window-focus";
import { processClipboardFocus } from "@/utils/clipboard-helpers";
import { useTauriApi } from "@/lib/TauriApiContext";

export interface UseClipboardMonitorOptions {
  /**
   * Callback to add a valid URL to the media list.
   */
  addMediaUrl: (url: string) => void;

  /**
   * Whether remote harness logging is enabled (for debugging).
   */
  harnessEnabled?: boolean;
}

export interface UseClipboardMonitorReturn {
  /**
   * Mark that a drop just occurred.
   * Call this in your drop handler to prevent clipboard import on the subsequent focus event.
   */
  markDropOccurred: () => void;

  /**
   * Reset the drop timestamp (useful for testing).
   */
  resetDropTimestamp: () => void;
}

/**
 * Hook for monitoring clipboard and auto-importing URLs on window focus.
 *
 * Features:
 * - Only imports when clipboardAutoImport setting is enabled
 * - Skips import for 500ms after a drop event (prevents duplicate additions)
 * - Logs import attempts for debugging
 *
 * @example
 * ```tsx
 * const { markDropOccurred } = useClipboardMonitor({
 *   addMediaUrl: (url) => addToList(url)
 * });
 *
 * const handleDrop = (url: string) => {
 *   markDropOccurred();
 *   addToList(url);
 * };
 * ```
 */
export function useClipboardMonitor(options: UseClipboardMonitorOptions): UseClipboardMonitorReturn {
  const { addMediaUrl, harnessEnabled = false } = options;

  const tauriApi = useTauriApi();
  const clipboardAutoImport = useAtomValue(clipboardAutoImportAtom);
  const addLogEntry = useSetAtom(addLogEntryAtom);

  // Ref to track when a drop occurred (skip clipboard on focus after drop)
  const lastDropTimeRef = useRef<number>(0);

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

  const handleWindowFocus = useCallback(() => {
    processClipboardFocus({
      enabled: clipboardAutoImport,
      lastDropTimestamp: lastDropTimeRef.current,
      readClipboardText: () => tauriApi.clipboard.readText(),
      addMediaUrl,
      logger: logClipboard,
    }).catch((error: unknown) => {
      logClipboard(
        "error",
        `Clipboard processing failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    });
  }, [clipboardAutoImport, tauriApi.clipboard, addMediaUrl, logClipboard]);

  // Subscribe to window focus events
  useWindowFocus(handleWindowFocus);

  const markDropOccurred = useCallback(() => {
    lastDropTimeRef.current = Date.now();
  }, []);

  const resetDropTimestamp = useCallback(() => {
    lastDropTimeRef.current = 0;
  }, []);

  return {
    markDropOccurred,
    resetDropTimestamp,
  };
}
