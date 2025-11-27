/**
 * Tests for useDownloadManager hook
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useDownloadManager } from "./useDownloadManager";
import {
  createTestWrapper,
  createMockMediaItem,
  downloadModeAtom,
  downloadRateLimitAtom,
  maxFileSizeAtom,
  appendUniqueIdAtom,
  uniqueIdTypeAtom,
  videoQualityAtom,
  maxResolutionAtom,
  videoFormatAtom,
  audioFormatAtom,
  audioQualityAtom,
} from "@/test/test-utils";
import { mockTauriApi, mockState } from "@/lib/tauri-api.mock";
import type { VideoInfo } from "@/components/MediaTable";

describe("useDownloadManager", () => {
  beforeEach(() => {
    mockState.reset();
    vi.clearAllMocks();
  });

  describe("initial state", () => {
    it("starts with globalDownloading false and globalProgress 0", () => {
      const wrapper = createTestWrapper();
      const { result } = renderHook(() => useDownloadManager([]), { wrapper });

      expect(result.current.globalDownloading).toBe(false);
      expect(result.current.globalProgress).toBe(0);
    });
  });

  describe("startDownload", () => {
    it("calls downloadMedia for pending items", async () => {
      const wrapper = createTestWrapper();
      const mediaList: VideoInfo[] = [
        createMockMediaItem("https://example.com/video1", {
          status: "Pending",
        }),
        createMockMediaItem("https://example.com/video2", {
          status: "Pending",
        }),
      ];
      const downloadMediaSpy = vi.spyOn(mockTauriApi.commands, "downloadMedia");

      const { result } = renderHook(() => useDownloadManager(mediaList), {
        wrapper,
      });

      await act(async () => {
        await result.current.startDownload();
      });

      await waitFor(() => {
        expect(downloadMediaSpy).toHaveBeenCalledTimes(2);
      });
    });

    it("skips items with status Done", async () => {
      const wrapper = createTestWrapper();
      const mediaList: VideoInfo[] = [
        createMockMediaItem("https://example.com/video1", { status: "Done" }),
        createMockMediaItem("https://example.com/video2", {
          status: "Pending",
        }),
      ];
      const downloadMediaSpy = vi.spyOn(mockTauriApi.commands, "downloadMedia");

      const { result } = renderHook(() => useDownloadManager(mediaList), {
        wrapper,
      });

      await act(async () => {
        await result.current.startDownload();
      });

      await waitFor(() => {
        expect(downloadMediaSpy).toHaveBeenCalledTimes(1);
        expect(downloadMediaSpy).toHaveBeenCalledWith(
          1,
          "https://example.com/video2",
          "/tmp/downloads",
          expect.any(Object),
        );
      });
    });

    it("sets globalDownloading to true when starting", async () => {
      const wrapper = createTestWrapper();
      const mediaList: VideoInfo[] = [
        createMockMediaItem("https://example.com/video1", {
          status: "Pending",
        }),
      ];

      const { result } = renderHook(() => useDownloadManager(mediaList), {
        wrapper,
      });

      await act(async () => {
        await result.current.startDownload();
      });

      expect(result.current.globalDownloading).toBe(true);
    });

    it("passes settings including rate limit and max file size", async () => {
      const wrapper = createTestWrapper([
        [downloadModeAtom, "audio"],
        [videoQualityAtom, "high"],
        [maxResolutionAtom, "1080p"],
        [videoFormatAtom, "mp4"],
        [audioFormatAtom, "mp3"],
        [audioQualityAtom, "2"],
        [downloadRateLimitAtom, "1M"],
        [maxFileSizeAtom, "100M"],
      ]);
      const mediaList: VideoInfo[] = [
        createMockMediaItem("https://example.com/video1", {
          status: "Pending",
        }),
      ];
      const downloadMediaSpy = vi.spyOn(mockTauriApi.commands, "downloadMedia");

      const { result } = renderHook(() => useDownloadManager(mediaList), {
        wrapper,
      });

      await act(async () => {
        await result.current.startDownload();
      });

      await waitFor(() => {
        expect(downloadMediaSpy).toHaveBeenCalledWith(
          0,
          "https://example.com/video1",
          "/tmp/downloads",
          expect.objectContaining({
            downloadMode: "audio",
            videoQuality: "high",
            maxResolution: "1080p",
            videoFormat: "mp4",
            audioFormat: "mp3",
            audioQuality: "2",
            downloadRateLimit: "1M",
            maxFileSize: "100M",
            appendUniqueId: true,
            uniqueIdType: "native",
          }),
        );
      });
    });
  });

  describe("cancelAllDownloads", () => {
    it("calls the cancelAllDownloads command", async () => {
      const wrapper = createTestWrapper();
      const cancelSpy = vi.spyOn(mockTauriApi.commands, "cancelAllDownloads");

      const { result } = renderHook(() => useDownloadManager([]), { wrapper });

      await act(async () => {
        await result.current.cancelAllDownloads();
      });

      expect(cancelSpy).toHaveBeenCalled();
    });
  });

  describe("progress updates", () => {
    it("tracks globalDownloading when downloading is active", async () => {
      const wrapper = createTestWrapper();
      const mediaList: VideoInfo[] = [
        createMockMediaItem("https://example.com/video1", {
          progress: 50,
          status: "Downloading",
        }),
        createMockMediaItem("https://example.com/video2", {
          progress: 100,
          status: "Done",
        }),
      ];

      const { result } = renderHook(() => useDownloadManager(mediaList), {
        wrapper,
      });

      await act(async () => {
        await result.current.startDownload();
      });

      await waitFor(() => {
        expect(result.current.globalDownloading).toBe(true);
      });
    });

    it("returns 0 for empty media list", () => {
      const wrapper = createTestWrapper();
      const { result } = renderHook(() => useDownloadManager([]), { wrapper });

      expect(result.current.globalProgress).toBe(0);
    });
  });

  describe("appendUniqueId setting", () => {
    it("passes appendUniqueId=true by default", async () => {
      const wrapper = createTestWrapper();
      const mediaList: VideoInfo[] = [
        createMockMediaItem("https://example.com/video1", {
          status: "Pending",
        }),
      ];
      const downloadMediaSpy = vi.spyOn(mockTauriApi.commands, "downloadMedia");

      const { result } = renderHook(() => useDownloadManager(mediaList), {
        wrapper,
      });

      await act(async () => {
        await result.current.startDownload();
      });

      await waitFor(() => {
        expect(downloadMediaSpy).toHaveBeenCalledWith(
          0,
          "https://example.com/video1",
          "/tmp/downloads",
          expect.objectContaining({
            appendUniqueId: true,
            uniqueIdType: "native",
          }),
        );
      });
    });

    it("passes appendUniqueId=false when disabled", async () => {
      const wrapper = createTestWrapper([[appendUniqueIdAtom, false]]);
      const mediaList: VideoInfo[] = [
        createMockMediaItem("https://example.com/video1", {
          status: "Pending",
        }),
      ];
      const downloadMediaSpy = vi.spyOn(mockTauriApi.commands, "downloadMedia");

      const { result } = renderHook(() => useDownloadManager(mediaList), {
        wrapper,
      });

      await act(async () => {
        await result.current.startDownload();
      });

      await waitFor(() => {
        expect(downloadMediaSpy).toHaveBeenCalledWith(
          0,
          "https://example.com/video1",
          "/tmp/downloads",
          expect.objectContaining({ appendUniqueId: false }),
        );
      });
    });

    it("passes uniqueIdType=hash when set", async () => {
      const wrapper = createTestWrapper([[uniqueIdTypeAtom, "hash"]]);
      const mediaList: VideoInfo[] = [
        createMockMediaItem("https://example.com/video1", {
          status: "Pending",
        }),
      ];
      const downloadMediaSpy = vi.spyOn(mockTauriApi.commands, "downloadMedia");

      const { result } = renderHook(() => useDownloadManager(mediaList), {
        wrapper,
      });

      await act(async () => {
        await result.current.startDownload();
      });

      await waitFor(() => {
        expect(downloadMediaSpy).toHaveBeenCalledWith(
          0,
          "https://example.com/video1",
          "/tmp/downloads",
          expect.objectContaining({
            appendUniqueId: true,
            uniqueIdType: "hash",
          }),
        );
      });
    });
  });
});
