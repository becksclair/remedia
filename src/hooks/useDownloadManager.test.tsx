/**
 * Tests for useDownloadManager hook
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useDownloadManager } from "./useDownloadManager";
import { TauriApiProvider } from "@/lib/TauriApiContext";
import { mockTauriApi, mockState } from "@/lib/tauri-api.mock";
import { Provider as JotaiProvider } from "jotai";
import { useHydrateAtoms } from "jotai/utils";
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
  appendUniqueIdAtom,
} from "@/state/settings-atoms";
import type { ReactNode } from "react";
import type { VideoInfo } from "@/components/MediaTable";

// Helper to create wrapper with initial atom values
function createWrapper(initialValues: Array<readonly [unknown, unknown]> = []) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <JotaiProvider>
        <TauriApiProvider api={mockTauriApi}>
          <HydrateAtoms initialValues={initialValues}>{children}</HydrateAtoms>
        </TauriApiProvider>
      </JotaiProvider>
    );
  };
}

function HydrateAtoms({
  initialValues,
  children,
}: {
  initialValues: Array<readonly [unknown, unknown]>;
  children: ReactNode;
}) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  useHydrateAtoms(initialValues as any);
  return children;
}

// Create a mock media list for testing
function createMockMediaList(
  items: Array<Partial<VideoInfo> & { url: string }>,
): VideoInfo[] {
  return items.map((item) => ({
    url: item.url,
    title: item.title || item.url,
    thumbnail: item.thumbnail || "",
    audioOnly: item.audioOnly || false,
    progress: item.progress || 0,
    status: item.status || "Pending",
  }));
}

describe("useDownloadManager", () => {
  beforeEach(() => {
    mockState.reset();
    vi.clearAllMocks();
  });

  describe("initial state", () => {
    it("starts with globalDownloading false", () => {
      const wrapper = createWrapper([[downloadLocationAtom, "/tmp/downloads"]]);
      const mediaList: VideoInfo[] = [];

      const { result } = renderHook(() => useDownloadManager(mediaList), {
        wrapper,
      });

      expect(result.current.globalDownloading).toBe(false);
    });

    it("starts with globalProgress 0", () => {
      const wrapper = createWrapper([[downloadLocationAtom, "/tmp/downloads"]]);
      const mediaList: VideoInfo[] = [];

      const { result } = renderHook(() => useDownloadManager(mediaList), {
        wrapper,
      });

      expect(result.current.globalProgress).toBe(0);
    });
  });

  describe("startDownload", () => {
    it("calls downloadMedia for pending items", async () => {
      const wrapper = createWrapper([
        [downloadLocationAtom, "/tmp/downloads"],
        [downloadModeAtom, "video"],
        [videoQualityAtom, "best"],
        [maxResolutionAtom, "no-limit"],
        [videoFormatAtom, "best"],
        [audioFormatAtom, "best"],
        [audioQualityAtom, "0"],
        [downloadRateLimitAtom, "unlimited"],
        [maxFileSizeAtom, "unlimited"],
      ]);

      const mediaList = createMockMediaList([
        { url: "https://example.com/video1", status: "Pending" },
        { url: "https://example.com/video2", status: "Pending" },
      ]);

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
      const wrapper = createWrapper([
        [downloadLocationAtom, "/tmp/downloads"],
        [downloadModeAtom, "video"],
        [videoQualityAtom, "best"],
        [maxResolutionAtom, "no-limit"],
        [videoFormatAtom, "best"],
        [audioFormatAtom, "best"],
        [audioQualityAtom, "0"],
        [downloadRateLimitAtom, "unlimited"],
        [maxFileSizeAtom, "unlimited"],
      ]);

      const mediaList = createMockMediaList([
        { url: "https://example.com/video1", status: "Done" },
        { url: "https://example.com/video2", status: "Pending" },
      ]);

      const downloadMediaSpy = vi.spyOn(mockTauriApi.commands, "downloadMedia");

      const { result } = renderHook(() => useDownloadManager(mediaList), {
        wrapper,
      });

      await act(async () => {
        await result.current.startDownload();
      });

      await waitFor(() => {
        expect(downloadMediaSpy).toHaveBeenCalledTimes(1);
        // downloadMedia is called with (mediaIdx, url, outputLocation, settings)
        expect(downloadMediaSpy).toHaveBeenCalledWith(
          1, // index of the Pending item
          "https://example.com/video2",
          "/tmp/downloads",
          expect.any(Object),
        );
      });
    });

    it("sets globalDownloading to true when starting", async () => {
      const wrapper = createWrapper([
        [downloadLocationAtom, "/tmp/downloads"],
        [downloadModeAtom, "video"],
        [videoQualityAtom, "best"],
        [maxResolutionAtom, "no-limit"],
        [videoFormatAtom, "best"],
        [audioFormatAtom, "best"],
        [audioQualityAtom, "0"],
        [downloadRateLimitAtom, "unlimited"],
        [maxFileSizeAtom, "unlimited"],
      ]);

      const mediaList = createMockMediaList([
        { url: "https://example.com/video1", status: "Pending" },
      ]);

      const { result } = renderHook(() => useDownloadManager(mediaList), {
        wrapper,
      });

      await act(async () => {
        await result.current.startDownload();
      });

      expect(result.current.globalDownloading).toBe(true);
    });

    it("passes settings including rate limit and max file size", async () => {
      const wrapper = createWrapper([
        [downloadLocationAtom, "/tmp/downloads"],
        [downloadModeAtom, "audio"],
        [videoQualityAtom, "high"],
        [maxResolutionAtom, "1080p"],
        [videoFormatAtom, "mp4"],
        [audioFormatAtom, "mp3"],
        [audioQualityAtom, "2"],
        [downloadRateLimitAtom, "1M"],
        [maxFileSizeAtom, "100M"],
      ]);

      const mediaList = createMockMediaList([
        { url: "https://example.com/video1", status: "Pending" },
      ]);

      const downloadMediaSpy = vi.spyOn(mockTauriApi.commands, "downloadMedia");

      const { result } = renderHook(() => useDownloadManager(mediaList), {
        wrapper,
      });

      await act(async () => {
        await result.current.startDownload();
      });

      await waitFor(() => {
        // downloadMedia is called with (mediaIdx, url, outputLocation, settings)
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
          }),
        );
      });
    });
  });

  describe("cancelAllDownloads", () => {
    it("calls the cancelAllDownloads command", async () => {
      const wrapper = createWrapper([[downloadLocationAtom, "/tmp/downloads"]]);
      const mediaList: VideoInfo[] = [];

      const cancelSpy = vi.spyOn(mockTauriApi.commands, "cancelAllDownloads");

      const { result } = renderHook(() => useDownloadManager(mediaList), {
        wrapper,
      });

      await act(async () => {
        await result.current.cancelAllDownloads();
      });

      expect(cancelSpy).toHaveBeenCalled();
    });
  });

  describe("progress updates", () => {
    it("updates globalProgress when downloading is active", async () => {
      const wrapper = createWrapper([
        [downloadLocationAtom, "/tmp/downloads"],
        [downloadModeAtom, "video"],
        [videoQualityAtom, "best"],
        [maxResolutionAtom, "no-limit"],
        [videoFormatAtom, "best"],
        [audioFormatAtom, "best"],
        [audioQualityAtom, "0"],
        [downloadRateLimitAtom, "unlimited"],
        [maxFileSizeAtom, "unlimited"],
      ]);

      const mediaList = createMockMediaList([
        {
          url: "https://example.com/video1",
          progress: 50,
          status: "Downloading",
        },
        { url: "https://example.com/video2", progress: 100, status: "Done" },
      ]);

      const { result } = renderHook(() => useDownloadManager(mediaList), {
        wrapper,
      });

      // Start download to trigger progress tracking
      await act(async () => {
        await result.current.startDownload();
      });

      // When downloading, globalProgress should reflect the media list progress
      await waitFor(() => {
        expect(result.current.globalDownloading).toBe(true);
      });
    });

    it("returns 0 for empty media list", () => {
      const wrapper = createWrapper([[downloadLocationAtom, "/tmp/downloads"]]);

      const mediaList: VideoInfo[] = [];

      const { result } = renderHook(() => useDownloadManager(mediaList), {
        wrapper,
      });

      expect(result.current.globalProgress).toBe(0);
    });
  });

  describe("appendUniqueId setting", () => {
    it("passes appendUniqueId=true by default", async () => {
      const wrapper = createWrapper([
        [downloadLocationAtom, "/tmp/downloads"],
        [downloadModeAtom, "video"],
        [videoQualityAtom, "best"],
        [maxResolutionAtom, "no-limit"],
        [videoFormatAtom, "best"],
        [audioFormatAtom, "best"],
        [audioQualityAtom, "0"],
        [downloadRateLimitAtom, "unlimited"],
        [maxFileSizeAtom, "unlimited"],
        // Default is true
      ]);

      const mediaList = createMockMediaList([
        { url: "https://example.com/video1", status: "Pending" },
      ]);

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
          }),
        );
      });
    });

    it("passes appendUniqueId=false when disabled", async () => {
      const wrapper = createWrapper([
        [downloadLocationAtom, "/tmp/downloads"],
        [downloadModeAtom, "video"],
        [videoQualityAtom, "best"],
        [maxResolutionAtom, "no-limit"],
        [videoFormatAtom, "best"],
        [audioFormatAtom, "best"],
        [audioQualityAtom, "0"],
        [downloadRateLimitAtom, "unlimited"],
        [maxFileSizeAtom, "unlimited"],
        [appendUniqueIdAtom, false],
      ]);

      const mediaList = createMockMediaList([
        { url: "https://example.com/video1", status: "Pending" },
      ]);

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
            appendUniqueId: false,
          }),
        );
      });
    });
  });
});
