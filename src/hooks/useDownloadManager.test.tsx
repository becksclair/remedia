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
import { createTestWrapper, createMockMediaItem } from "@/test/test-utils";
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

      await waitFor(
        () => {
          expect(downloadMediaSpy).toHaveBeenCalledTimes(1);
          // Should only be called for the second item (index 1, the Pending one)
          const call = downloadMediaSpy.mock.calls[0]!;
          expect(call[0]).toBe(1); // Index 1 (second item)
          expect(call[1]).toContain("pending-video"); // URL
          expect(typeof call[2]).toBe("string"); // outputLocation
          expect(call[3]).toBeUndefined(); // subfolder
          expect(call[4]).toBeDefined(); // settings object exists
        },
        { timeout: 2000 },
      );
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

    it("passes settings object to downloadMedia", async () => {
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

      await waitFor(
        () => {
          expect(downloadMediaSpy).toHaveBeenCalledTimes(1);
          const call = downloadMediaSpy.mock.calls[0]!;
          expect(call[0]).toBe(0); // mediaIdx
          expect(call[1]).toBe("https://example.com/video1"); // URL
          expect(typeof call[2]).toBe("string"); // outputLocation
          expect(call[3]).toBeUndefined(); // subfolder
          // Verify settings object exists and has required keys
          const settings = call[4]!;
          expect(settings).toBeDefined();
          expect("downloadMode" in settings).toBe(true);
          expect("videoQuality" in settings).toBe(true);
          expect("maxResolution" in settings).toBe(true);
          expect("videoFormat" in settings).toBe(true);
          expect("audioFormat" in settings).toBe(true);
          expect("audioQuality" in settings).toBe(true);
          expect("downloadRateLimit" in settings).toBe(true);
          expect("maxFileSize" in settings).toBe(true);
          expect("appendUniqueId" in settings).toBe(true);
          expect("uniqueIdType" in settings).toBe(true);
        },
        { timeout: 2000 },
      );
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

  describe("settings structure", () => {
    it("includes all required settings keys", async () => {
      const wrapper = createTestWrapper();
      const mediaList: VideoInfo[] = [
        createMockMediaItem("https://example.com/video1", { status: "Pending" }),
      ];
      const downloadMediaSpy = spyOn(mockTauriApi.commands, "downloadMedia");

      const { result } = renderHook(() => useDownloadManager(mediaList), { wrapper });

      await act(async () => {
        await result.current.startDownload();
      });

      await waitFor(
        () => {
          expect(downloadMediaSpy).toHaveBeenCalledTimes(1);
          const settings = downloadMediaSpy.mock.calls[0]![4]!;
          expect(settings).toBeDefined();
          // Verify all required keys exist
          expect("appendUniqueId" in settings).toBe(true);
          expect("uniqueIdType" in settings).toBe(true);
          expect("downloadRateLimit" in settings).toBe(true);
          expect("maxFileSize" in settings).toBe(true);
          expect("downloadMode" in settings).toBe(true);
          expect("videoQuality" in settings).toBe(true);
          expect("audioFormat" in settings).toBe(true);
        },
        { timeout: 2000 },
      );
    });
  });
});
