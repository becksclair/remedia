/**
 * useDownloadManager Hook
 *
 * Manages download operations and global download state.
 */

import { useState, useCallback, useEffect, useRef } from "react";
import { useAtomValue, useSetAtom } from "jotai";
import {
  downloadLocationAtom,
  downloadModeAtom,
  videoQualityAtom,
  maxResolutionAtom,
  videoFormatAtom,
  audioFormatAtom,
  audioQualityAtom,
  downloadRateLimitAtom,
  maxFileSizeAtom,
} from "@/state/settings-atoms";
import { calculateGlobalProgress, hasActiveDownloads } from "@/utils/media-helpers";
import type { DownloadSettings } from "@/types";
import { useTauriApi } from "@/lib/TauriApiContext";
import type { VideoInfo } from "@/components/MediaTable";

export function useDownloadManager(mediaList: VideoInfo[]) {
  const [globalProgress, setGlobalProgress] = useState(0);
  const [globalDownloading, setGlobalDownloading] = useState(false);
  const inFlightRef = useRef(false);
  const retryDelayMs = 400;
  const retryLimit = 4;

  const tauriApi = useTauriApi();
  const setOutputLocation = useSetAtom(downloadLocationAtom);

  // Read download settings
  const outputLocation = useAtomValue(downloadLocationAtom);
  const downloadMode = useAtomValue(downloadModeAtom);
  const videoQuality = useAtomValue(videoQualityAtom);
  const maxResolution = useAtomValue(maxResolutionAtom);
  const videoFormat = useAtomValue(videoFormatAtom);
  const audioFormat = useAtomValue(audioFormatAtom);
  const audioQuality = useAtomValue(audioQualityAtom);
  const downloadRateLimit = useAtomValue(downloadRateLimitAtom);
  const maxFileSize = useAtomValue(maxFileSizeAtom);

  /**
   * Start download for all media in the list
   */
  const startDownload = useCallback(async () => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    setGlobalProgress(0);
    setGlobalDownloading(true);

    // Ensure we always have a valid output directory before invoking backend
    let resolvedOutput = outputLocation;
    if (!resolvedOutput) {
      try {
        resolvedOutput = await tauriApi.path.getDownloadDir();
        setOutputLocation(resolvedOutput);
      } catch (error) {
        console.error("Failed to resolve download directory", error);
        setGlobalDownloading(false);
        return;
      }
    }

    // Collect current settings
    const settings: DownloadSettings = {
      downloadMode,
      videoQuality,
      maxResolution,
      videoFormat,
      audioFormat,
      audioQuality,
      downloadRateLimit,
      maxFileSize,
    };

    try {
      const kickOff = async (attempt: number): Promise<void> => {
        const pending = mediaList
          .map((media, idx) => ({ media, idx }))
          .filter(({ media }) => media.status !== "Done");

        if (pending.length === 0) {
          if (attempt < retryLimit) {
            await new Promise((r) => setTimeout(r, retryDelayMs));
            return kickOff(attempt + 1);
          }
          console.warn("startDownload: no pending items after retries, giving up");
          setGlobalDownloading(false);
          inFlightRef.current = false;
          return;
        }

        await Promise.all(
          pending.map(({ media, idx }) =>
            tauriApi.commands.downloadMedia(idx, media.url, resolvedOutput, settings),
          ),
        );
      };

      await kickOff(0);
    } catch (err) {
      console.error("Error starting download:", err);
      alert("Error starting download");
      setGlobalDownloading(false);
      inFlightRef.current = false;
    }
  }, [
    mediaList,
    outputLocation,
    downloadMode,
    videoQuality,
    maxResolution,
    videoFormat,
    audioFormat,
    audioQuality,
    downloadRateLimit,
    maxFileSize,
    tauriApi.commands,
    tauriApi.path,
    setOutputLocation,
  ]);

  /**
   * Cancel all active downloads
   */
  const cancelAllDownloads = useCallback(async () => {
    try {
      await tauriApi.commands.cancelAllDownloads();
      console.log("Cancel all downloads requested");
    } catch (error) {
      console.error("Failed to cancel downloads:", error);
    }
  }, [tauriApi.commands]);

  /**
   * Update global download state based on media list
   */
  useEffect(() => {
    const isDownloading = hasActiveDownloads(mediaList);
    setGlobalDownloading(isDownloading);
    if (!isDownloading) {
      inFlightRef.current = false;
    }
    setGlobalProgress(isDownloading ? calculateGlobalProgress(mediaList) : 0);
  }, [mediaList]);

  return {
    globalProgress,
    globalDownloading,
    startDownload,
    cancelAllDownloads,
  };
}
