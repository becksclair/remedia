import { useCallback, useEffect, useState } from "react";
import type { Event } from "@tauri-apps/api/event";

import { useTauriEvents } from "@/hooks/useTauriEvent";
import { TAURI_EVENT, type RemoteEventName } from "@/types";

interface UseRemoteControlOptions {
  addMediaUrl: (url: string) => void;
  removeAll: () => void;
  setOutputLocation: (path: string) => void;
  startAllDownloads: () => Promise<void>;
  cancelAllDownloads: () => Promise<void>;
  mediaListLength: number;
  logAction: (...args: unknown[]) => void;
}

export function useRemoteControl({
  addMediaUrl,
  removeAll,
  setOutputLocation,
  startAllDownloads,
  cancelAllDownloads,
  mediaListLength,
  logAction,
}: UseRemoteControlOptions) {
  const [pendingRemoteStart, setPendingRemoteStart] = useState(false);

  const scheduleRemoteStart = useCallback(() => {
    setPendingRemoteStart(true);
  }, []);

  const handleRemoteAddUrl = useCallback(
    (event: Event<string>) => {
      const url = event.payload;
      if (typeof url !== "string" || !url.trim()) return;
      addMediaUrl(url);
      logAction("remote-add-url", url);
      scheduleRemoteStart();
    },
    [addMediaUrl, logAction, scheduleRemoteStart],
  );

  const handleRemoteStart = useCallback(() => {
    logAction("remote-start-downloads");
    scheduleRemoteStart();
  }, [logAction, scheduleRemoteStart]);

  const handleRemoteCancel = useCallback(() => {
    logAction("remote-cancel-downloads");
    void cancelAllDownloads();
  }, [cancelAllDownloads, logAction]);

  const handleRemoteClear = useCallback(() => {
    logAction("remote-clear-list");
    removeAll();
    setPendingRemoteStart(false);
  }, [logAction, removeAll]);

  const handleRemoteSetDownloadDir = useCallback(
    (event: Event<string>) => {
      const path = event.payload;
      if (typeof path === "string" && path.trim()) {
        logAction("remote-set-download-dir", path);
        setOutputLocation(path);
      }
    },
    [logAction, setOutputLocation],
  );

  useEffect(() => {
    if (pendingRemoteStart && mediaListLength > 0) {
      setPendingRemoteStart(false);
      void startAllDownloads();
    }
  }, [pendingRemoteStart, mediaListLength, startAllDownloads]);

  useTauriEvents<RemoteEventName>({
    [TAURI_EVENT.remoteAddUrl]: handleRemoteAddUrl,
    [TAURI_EVENT.remoteStartDownloads]: handleRemoteStart,
    [TAURI_EVENT.remoteCancelDownloads]: handleRemoteCancel,
    [TAURI_EVENT.remoteClearList]: handleRemoteClear,
    [TAURI_EVENT.remoteSetDownloadDir]: handleRemoteSetDownloadDir,
  });

  return { hasPendingRemoteStart: pendingRemoteStart };
}
