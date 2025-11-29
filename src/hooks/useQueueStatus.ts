import { useCallback, useEffect, useState, useMemo, useRef } from "react";

import { useTauriApi } from "@/lib/TauriApiContext";
import { useTauriEvents } from "@/hooks/useTauriEvent";
import { TAURI_EVENT, type DownloadEventName } from "@/types";

export interface QueueStats {
  queued: number;
  active: number;
  maxConcurrent: number;
}

const DEFAULT_STATS: QueueStats = {
  queued: 0,
  active: 0,
  maxConcurrent: 0,
};

/** Debounce interval for queue status refresh (ms) */
const QUEUE_STATUS_DEBOUNCE_MS = 100;

export function useQueueStatus() {
  const tauriApi = useTauriApi();
  const [queueStats, setQueueStats] = useState<QueueStats>(DEFAULT_STATS);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refreshQueueStatus = useCallback(async () => {
    try {
      const [queued, active, maxConcurrent] = await tauriApi.commands.getQueueStatus();
      setQueueStats({ queued, active, maxConcurrent });
    } catch (error) {
      console.error("Failed to fetch queue status", error);
    }
  }, [tauriApi.commands]);

  // Debounced refresh to avoid IPC storm during batch operations
  const debouncedRefresh = useMemo(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => {
        void refreshQueueStatus();
        timeoutRef.current = null;
      }, QUEUE_STATUS_DEBOUNCE_MS);
    };
  }, [refreshQueueStatus]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  useEffect(() => {
    void refreshQueueStatus();
  }, [refreshQueueStatus]);

  useTauriEvents<DownloadEventName>({
    [TAURI_EVENT.downloadQueued]: debouncedRefresh,
    [TAURI_EVENT.downloadStarted]: debouncedRefresh,
    [TAURI_EVENT.downloadCancelled]: debouncedRefresh,
    [TAURI_EVENT.downloadComplete]: debouncedRefresh,
    [TAURI_EVENT.downloadError]: debouncedRefresh,
  });

  return { queueStats, refreshQueueStatus };
}
