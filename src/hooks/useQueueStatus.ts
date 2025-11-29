import { useCallback, useEffect, useState } from "react";

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

export function useQueueStatus() {
  const tauriApi = useTauriApi();
  const [queueStats, setQueueStats] = useState<QueueStats>(DEFAULT_STATS);

  const refreshQueueStatus = useCallback(async () => {
    try {
      const [queued, active, maxConcurrent] = await tauriApi.commands.getQueueStatus();
      setQueueStats({ queued, active, maxConcurrent });
    } catch (error) {
      console.error("Failed to fetch queue status", error);
    }
  }, [tauriApi.commands]);

  useEffect(() => {
    void refreshQueueStatus();
  }, [refreshQueueStatus]);

  useTauriEvents<DownloadEventName>({
    [TAURI_EVENT.downloadQueued]: () => {
      void refreshQueueStatus();
    },
    [TAURI_EVENT.downloadStarted]: () => {
      void refreshQueueStatus();
    },
    [TAURI_EVENT.downloadCancelled]: () => {
      void refreshQueueStatus();
    },
    [TAURI_EVENT.downloadComplete]: () => {
      void refreshQueueStatus();
    },
    [TAURI_EVENT.downloadError]: () => {
      void refreshQueueStatus();
    },
  });

  return { queueStats, refreshQueueStatus };
}
