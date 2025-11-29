/**
 * Unit tests for useDownloadManager Hook
 *
 * Tests individual hook behavior and state management.
 * See ../test/integration/download-flow-integration.test.tsx for end-to-end tests.
 */

import { describe, it, expect, beforeEach, spyOn, vi } from "bun:test";
import { TestingLibraryMatchers } from "@testing-library/jest-dom/matchers";

// Extend Bun's expect with jest-dom matchers
declare module "bun:test" {
  interface Matchers<T> extends TestingLibraryMatchers<typeof expect.stringContaining, T> {}
}

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
import type { VideoInfo } from "@/utils/media-helpers";

describe("useDownloadManager", () => {
  beforeEach(() => {
    // Clear localStorage to ensure clean state for atomWithStorage
    localStorage.clear();
    mockState.reset();
    vi.clearAllMocks();
    // Restore all spies to ensure test isolation
    vi.restoreAllMocks();
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
      const downloadMediaSpy = spyOn(mockTauriApi.commands, "downloadMedia");

      const { result } = renderHook(() => useDownloadManager(mediaList), {
        wrapper,
      });

      await act(async () => {
        await result.current.startDownload();
      });

      await waitFor(() => {
        expect(downloadMediaSpy).toHaveBeenCalledTimes(2);
      });

      // Cleanup: wait a bit for any async operations to complete
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    it("skips items with status Done", async () => {
      const wrapper = createTestWrapper();
      // Use unique URLs to avoid any potential caching/reference issues
      const mediaList: VideoInfo[] = [
        createMockMediaItem("https://example.com/done-video-" + Math.random(), { status: "Done" }),
        createMockMediaItem("https://example.com/pending-video-" + Math.random(), {
          status: "Pending",
        }),
      ];
      const downloadMediaSpy = spyOn(mockTauriApi.commands, "downloadMedia");

      const { result } = renderHook(() => useDownloadManager(mediaList), {
        wrapper,
      });

      await act(async () => {
        await result.current.startDownload();
      });

      await waitFor(() => {
        expect(downloadMediaSpy).toHaveBeenCalledTimes(1);
        // Should only be called for the second item (index 1, the Pending one)
        expect(downloadMediaSpy).toHaveBeenCalledWith(
          1, // Index 1 (second item)
          expect.stringContaining("pending-video"),
          "/tmp/downloads",
          undefined, // subfolder
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
      const downloadMediaSpy = spyOn(mockTauriApi.commands, "downloadMedia");

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
          undefined, // subfolder
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
      const cancelSpy = spyOn(mockTauriApi.commands, "cancelAllDownloads");

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
      const downloadMediaSpy = spyOn(mockTauriApi.commands, "downloadMedia");

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
          undefined,
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
      const downloadMediaSpy = spyOn(mockTauriApi.commands, "downloadMedia");

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
          undefined,
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
      const downloadMediaSpy = spyOn(mockTauriApi.commands, "downloadMedia");

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
          undefined,
          expect.objectContaining({
            appendUniqueId: true,
            uniqueIdType: "hash",
          }),
        );
      });
    });
  });

  describe("download rate limit setting", () => {
    it("passes downloadRateLimit when set to specific value", async () => {
      const wrapper = createTestWrapper([[downloadRateLimitAtom, "50M"]]);
      const mediaList: VideoInfo[] = [
        createMockMediaItem("https://example.com/video1", {
          status: "Pending",
        }),
      ];
      const downloadMediaSpy = spyOn(mockTauriApi.commands, "downloadMedia");

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
          undefined,
          expect.objectContaining({
            downloadRateLimit: "50M",
          }),
        );
      });
    });

    it("passes downloadRateLimit=unlimited when not set", async () => {
      const wrapper = createTestWrapper([[downloadRateLimitAtom, "unlimited"]]);
      const mediaList: VideoInfo[] = [
        createMockMediaItem("https://example.com/video1", {
          status: "Pending",
        }),
      ];
      const downloadMediaSpy = spyOn(mockTauriApi.commands, "downloadMedia");

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
          undefined,
          expect.objectContaining({
            downloadRateLimit: "unlimited",
          }),
        );
      });
    });
  });

  describe("max file size setting", () => {
    it("passes maxFileSize when set to specific value", async () => {
      const wrapper = createTestWrapper([[maxFileSizeAtom, "100M"]]);
      const mediaList: VideoInfo[] = [
        createMockMediaItem("https://example.com/video1", {
          status: "Pending",
        }),
      ];
      const downloadMediaSpy = spyOn(mockTauriApi.commands, "downloadMedia");

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
          undefined,
          expect.objectContaining({
            maxFileSize: "100M",
          }),
        );
      });
    });

    it("passes maxFileSize=unlimited when not set", async () => {
      const wrapper = createTestWrapper([[maxFileSizeAtom, "unlimited"]]);
      const mediaList: VideoInfo[] = [
        createMockMediaItem("https://example.com/video1", {
          status: "Pending",
        }),
      ];
      const downloadMediaSpy = spyOn(mockTauriApi.commands, "downloadMedia");

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
          undefined,
          expect.objectContaining({
            maxFileSize: "unlimited",
          }),
        );
      });
    });
  });
});
