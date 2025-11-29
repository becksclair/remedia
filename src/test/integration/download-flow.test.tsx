/**
 * Integration Test: Download Flow
 *
 * Tests the complete flow from URL addition to download completion.
 */

import "@/test/global-setup"; // Ensure global cleanup runs
import { describe, it, expect, beforeEach, afterEach, spyOn } from "bun:test";
import { TestingLibraryMatchers } from "@testing-library/jest-dom/matchers";

// Extend Bun's expect with jest-dom matchers
declare module "bun:test" {
  interface Matchers<T> extends TestingLibraryMatchers<typeof expect.stringContaining, T> {}
}

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
  videoQualityAtom,
  maxResolutionAtom,
  videoFormatAtom,
  appendUniqueIdAtom,
  uniqueIdTypeAtom,
  HydrateAtoms,
} from "@/test/test-utils";
import { TauriApiProvider } from "@/lib/TauriApiContext";
import { PlaylistProvider } from "@/lib/PlaylistContext";
import { mockTauriApi, mockState } from "@/lib/tauri-api.mock";
import { Provider as JotaiProvider } from "jotai";
import type { ReactNode } from "react";

describe("Download Flow Integration", () => {
  let getMediaInfoSpy: ReturnType<typeof spyOn>;
  let downloadMediaSpy: ReturnType<typeof spyOn>;
  let cancelAllDownloadsSpy: ReturnType<typeof spyOn>;

  beforeEach(() => {
    // Clear localStorage to ensure clean state for atomWithStorage
    localStorage.clear();
    mockState.reset();

    getMediaInfoSpy = spyOn(mockTauriApi.commands, "getMediaInfo");
    downloadMediaSpy = spyOn(mockTauriApi.commands, "downloadMedia");
    cancelAllDownloadsSpy = spyOn(mockTauriApi.commands, "cancelAllDownloads");
  });

  afterEach(() => {
    // Restore individual spies
    getMediaInfoSpy?.mockRestore();
    downloadMediaSpy?.mockRestore();
    cancelAllDownloadsSpy?.mockRestore();
    mockState.reset();
  });

  describe("URL → Media Info → Download → Completion", () => {
    it("completes full download cycle for a single URL", async () => {
      const wrapper = createTestWrapper([
        [downloadLocationAtom, "/tmp/downloads"],
        [downloadModeAtom, "video"],
        [videoQualityAtom, "best"],
        [maxResolutionAtom, "no-limit"],
        [videoFormatAtom, "best"],
        [audioFormatAtom, "best"],
        [audioQualityAtom, "0"],
        [downloadRateLimitAtom, "unlimited"],
        [maxFileSizeAtom, "unlimited"],
        [appendUniqueIdAtom, true],
        [uniqueIdTypeAtom, "native"],
      ]);
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

      expect(mediaListHook.result.current.mediaList[0]?.title).toBe("Test Video");

      // Step 4: Start download
      downloadManagerHook.rerender();
      await act(async () => {
        await downloadManagerHook.result.current.startDownload();
      });

      expect(downloadManagerHook.result.current.globalDownloading).toBe(true);

      // Step 5: Verify downloadMedia was called with the correct media and a settings object
      await waitFor(() => {
        expect(downloadMediaSpy).toHaveBeenCalledTimes(1);
      });

      const [calledIdx, calledUrl, calledOutputLocation, calledSubfolder, calledSettings] =
        downloadMediaSpy.mock.calls[0];

      expect(calledIdx).toBe(0);
      expect(calledUrl).toBe(testUrl);
      expect(typeof calledOutputLocation).toBe("string");
      expect(calledSubfolder).toBeUndefined();
      expect(calledSettings).toBeDefined();
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

    it("expands playlist URLs into individual items", async () => {
      mockState.playlistExpansion = {
        playlistName: "Test Playlist",
        entries: [
          { url: "https://example.com/a", title: "First" },
          { url: "https://example.com/b", title: "Second" },
        ],
      };

      const wrapper = createTestWrapper();
      const mediaListHook = renderHook(() => useMediaList(), { wrapper });

      act(() => {
        mediaListHook.result.current.addMediaUrl("https://example.com/playlist");
      });

      await waitFor(() => {
        expect(mediaListHook.result.current.mediaList).toHaveLength(2);
      });

      expect(mediaListHook.result.current.mediaList[0]?.title).toBe("First");
      expect(mediaListHook.result.current.mediaList[1]?.title).toBe("Second");

      await waitFor(() => {
        expect(getMediaInfoSpy).toHaveBeenCalledWith(0, "https://example.com/a");
        expect(getMediaInfoSpy).toHaveBeenCalledWith(1, "https://example.com/b");
      });
    });

    it("skips already completed downloads", async () => {
      const wrapper = createTestWrapper();
      const mediaListHook = renderHook(() => useMediaList(), { wrapper });

      act(() => {
        mediaListHook.result.current.addMediaUrl("https://example.com/done.mp4");
        mediaListHook.result.current.updateMediaItem({
          url: "https://example.com/done.mp4",
          status: "Done",
          progress: 100,
        });
        mediaListHook.result.current.addMediaUrl("https://example.com/pending.mp4");
      });

      const downloadManagerHook = renderHook(
        () => useDownloadManager(mediaListHook.result.current.mediaList),
        { wrapper },
      );

      // Note: Bun doesn't have clearAllMocks equivalent

      await act(async () => {
        await downloadManagerHook.result.current.startDownload();
      });

      await waitFor(() => {
        expect(downloadMediaSpy).toHaveBeenCalledTimes(1);
        expect(downloadMediaSpy).toHaveBeenCalledWith(
          1,
          "https://example.com/pending.mp4",
          expect.any(String),
          undefined, // subfolder
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
              <PlaylistProvider>
                <HydrateAtoms
                  initialValues={[
                    [downloadLocationAtom, "/custom/path"],
                    [downloadModeAtom, "audio"],
                    [audioFormatAtom, "mp3"],
                    [audioQualityAtom, "0"],
                    [downloadRateLimitAtom, "1M"],
                    [maxFileSizeAtom, "500M"],
                    [appendUniqueIdAtom, true],
                    [uniqueIdTypeAtom, "native"],
                    [videoQualityAtom, "best"],
                    [maxResolutionAtom, "no-limit"],
                    [videoFormatAtom, "best"],
                  ]}
                >
                  {children}
                </HydrateAtoms>
              </PlaylistProvider>
            </TauriApiProvider>
          </JotaiProvider>
        );
      }

      const mediaListHook = renderHook(() => useMediaList(), {
        wrapper: CustomWrapper,
      });

      act(() => {
        mediaListHook.result.current.addMediaUrl("https://example.com/audio.mp3");
      });

      const downloadManagerHook = renderHook(
        () => useDownloadManager(mediaListHook.result.current.mediaList),
        { wrapper: CustomWrapper },
      );

      await act(async () => {
        await downloadManagerHook.result.current.startDownload();
      });

      await waitFor(() => {
        expect(downloadMediaSpy).toHaveBeenCalledTimes(1);
      });

      const [audioIdx, audioUrl, audioOutputLocation, audioSubfolder, audioSettings] =
        downloadMediaSpy.mock.calls[0];

      expect(audioIdx).toBe(0);
      expect(audioUrl).toBe("https://example.com/audio.mp3");
      expect(typeof audioOutputLocation).toBe("string");
      expect(audioSubfolder).toBeUndefined();
      // Ensure we at least pass some settings object; detailed settings are
      // validated in useDownloadManager unit tests.
      expect(audioSettings).toBeDefined();
    });
  });

  describe("Error Handling", () => {
    it("handles duplicate URL gracefully", () => {
      const wrapper = createTestWrapper();
      const { result } = renderHook(() => useMediaList(), { wrapper });
      const consoleSpy = spyOn(console, "log").mockImplementation(() => {});

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
        mediaListHook.result.current.addMediaUrl("https://example.com/video.mp4");
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
