/**
 * Integration Test: Download Flow
 *
 * Tests the complete flow from URL addition to download completion.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useMediaList } from "@/hooks/useMediaList";
import { useDownloadManager } from "@/hooks/useDownloadManager";
import {
  createTestWrapper,
  downloadLocationAtom,
  downloadModeAtom,
  audioFormatAtom,
  audioQualityAtom,
  downloadRateLimitAtom,
  maxFileSizeAtom,
  HydrateAtoms,
  DEFAULT_DOWNLOAD_SETTINGS,
} from "@/test/test-utils";
import { TauriApiProvider } from "@/lib/TauriApiContext";
import { mockTauriApi, mockState } from "@/lib/tauri-api.mock";
import { Provider as JotaiProvider } from "jotai";
import type { ReactNode } from "react";

describe("Download Flow Integration", () => {
  let getMediaInfoSpy: ReturnType<typeof vi.spyOn>;
  let downloadMediaSpy: ReturnType<typeof vi.spyOn>;
  let cancelAllDownloadsSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    mockState.reset();
    vi.clearAllMocks();
    getMediaInfoSpy = vi.spyOn(mockTauriApi.commands, "getMediaInfo");
    downloadMediaSpy = vi.spyOn(mockTauriApi.commands, "downloadMedia");
    cancelAllDownloadsSpy = vi.spyOn(
      mockTauriApi.commands,
      "cancelAllDownloads",
    );
  });

  afterEach(() => {
    mockState.reset();
    vi.restoreAllMocks();
  });

  describe("URL → Media Info → Download → Completion", () => {
    it("completes full download cycle for a single URL", async () => {
      const wrapper = createTestWrapper();
      const mediaListHook = renderHook(() => useMediaList(), { wrapper });
      const downloadManagerHook = renderHook(
        () => useDownloadManager(mediaListHook.result.current.mediaList),
        { wrapper },
      );

      // Step 1: Add URL
      const testUrl = "https://example.com/video.mp4";
      act(() => {
        mediaListHook.result.current.addMediaUrl(testUrl);
      });

      expect(mediaListHook.result.current.mediaList).toHaveLength(1);
      expect(mediaListHook.result.current.mediaList[0]).toMatchObject({
        url: testUrl,
        status: "Pending",
        progress: 0,
      });

      // Step 2: Verify getMediaInfo was called
      await waitFor(() => {
        expect(getMediaInfoSpy).toHaveBeenCalledWith(0, testUrl);
      });

      // Step 3: Simulate media info response
      act(() => {
        mediaListHook.result.current.updateMediaItem({
          url: testUrl,
          title: "Test Video",
          thumbnail: "https://example.com/thumb.jpg",
        });
      });

      expect(mediaListHook.result.current.mediaList[0]?.title).toBe(
        "Test Video",
      );

      // Step 4: Start download
      downloadManagerHook.rerender();
      await act(async () => {
        await downloadManagerHook.result.current.startDownload();
      });

      expect(downloadManagerHook.result.current.globalDownloading).toBe(true);

      // Step 5: Verify downloadMedia was called
      await waitFor(() => {
        expect(downloadMediaSpy).toHaveBeenCalledWith(
          0,
          testUrl,
          "/tmp/downloads",
          expect.objectContaining({
            downloadMode: "video",
            videoQuality: "best",
            downloadRateLimit: "unlimited",
            maxFileSize: "unlimited",
          }),
        );
      });
    });

    it("handles multiple URLs in sequence", async () => {
      const wrapper = createTestWrapper();
      const mediaListHook = renderHook(() => useMediaList(), { wrapper });

      const urls = [
        "https://example.com/video1.mp4",
        "https://example.com/video2.mp4",
        "https://example.com/video3.mp4",
      ];

      act(() => {
        urls.forEach((url) => mediaListHook.result.current.addMediaUrl(url));
      });

      expect(mediaListHook.result.current.mediaList).toHaveLength(3);

      await waitFor(() => {
        urls.forEach((url, idx) => {
          expect(getMediaInfoSpy).toHaveBeenCalledWith(idx, url);
        });
      });
    });

    it("skips already completed downloads", async () => {
      const wrapper = createTestWrapper();
      const mediaListHook = renderHook(() => useMediaList(), { wrapper });

      act(() => {
        mediaListHook.result.current.addMediaUrl(
          "https://example.com/done.mp4",
        );
        mediaListHook.result.current.updateMediaItem({
          url: "https://example.com/done.mp4",
          status: "Done",
          progress: 100,
        });
        mediaListHook.result.current.addMediaUrl(
          "https://example.com/pending.mp4",
        );
      });

      const downloadManagerHook = renderHook(
        () => useDownloadManager(mediaListHook.result.current.mediaList),
        { wrapper },
      );

      vi.clearAllMocks();

      await act(async () => {
        await downloadManagerHook.result.current.startDownload();
      });

      await waitFor(() => {
        expect(downloadMediaSpy).toHaveBeenCalledTimes(1);
        expect(downloadMediaSpy).toHaveBeenCalledWith(
          1,
          "https://example.com/pending.mp4",
          expect.any(String),
          expect.any(Object),
        );
      });
    });

    it("passes custom settings to download", async () => {
      // Custom wrapper with audio mode settings
      function CustomWrapper({ children }: { children: ReactNode }) {
        return (
          <JotaiProvider>
            <TauriApiProvider api={mockTauriApi}>
              <HydrateAtoms
                initialValues={[
                  [downloadLocationAtom, "/custom/path"],
                  [downloadModeAtom, "audio"],
                  [audioFormatAtom, "mp3"],
                  [audioQualityAtom, "0"],
                  [downloadRateLimitAtom, "1M"],
                  [maxFileSizeAtom, "500M"],
                  ...DEFAULT_DOWNLOAD_SETTINGS.filter(
                    ([atom]) =>
                      ![
                        downloadLocationAtom,
                        downloadModeAtom,
                        audioFormatAtom,
                        audioQualityAtom,
                        downloadRateLimitAtom,
                        maxFileSizeAtom,
                      ].includes(atom as any),
                  ),
                ]}
              >
                {children}
              </HydrateAtoms>
            </TauriApiProvider>
          </JotaiProvider>
        );
      }

      const mediaListHook = renderHook(() => useMediaList(), {
        wrapper: CustomWrapper,
      });

      act(() => {
        mediaListHook.result.current.addMediaUrl(
          "https://example.com/audio.mp3",
        );
      });

      const downloadManagerHook = renderHook(
        () => useDownloadManager(mediaListHook.result.current.mediaList),
        { wrapper: CustomWrapper },
      );

      await act(async () => {
        await downloadManagerHook.result.current.startDownload();
      });

      await waitFor(() => {
        expect(downloadMediaSpy).toHaveBeenCalledWith(
          0,
          "https://example.com/audio.mp3",
          "/custom/path",
          expect.objectContaining({
            downloadMode: "audio",
            audioFormat: "mp3",
            downloadRateLimit: "1M",
            maxFileSize: "500M",
          }),
        );
      });
    });
  });

  describe("Error Handling", () => {
    it("handles duplicate URL gracefully", () => {
      const wrapper = createTestWrapper();
      const { result } = renderHook(() => useMediaList(), { wrapper });
      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

      act(() => {
        result.current.addMediaUrl("https://example.com/video.mp4");
        result.current.addMediaUrl("https://example.com/video.mp4");
      });

      expect(result.current.mediaList).toHaveLength(1);
      expect(consoleSpy).toHaveBeenCalledWith("URL already exists in the list");

      consoleSpy.mockRestore();
    });

    it("handles cancel all downloads", async () => {
      const wrapper = createTestWrapper();
      const mediaListHook = renderHook(() => useMediaList(), { wrapper });

      act(() => {
        mediaListHook.result.current.addMediaUrl(
          "https://example.com/video.mp4",
        );
      });

      const downloadManagerHook = renderHook(
        () => useDownloadManager(mediaListHook.result.current.mediaList),
        { wrapper },
      );

      await act(async () => {
        await downloadManagerHook.result.current.startDownload();
      });

      await act(async () => {
        await downloadManagerHook.result.current.cancelAllDownloads();
      });

      expect(cancelAllDownloadsSpy).toHaveBeenCalled();
    });
  });
});
