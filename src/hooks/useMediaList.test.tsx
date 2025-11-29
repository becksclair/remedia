/**
 * Tests for useMediaList hook
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useMediaList } from "./useMediaList";
import { TauriApiProvider } from "@/lib/TauriApiContext";
import { PlaylistProvider } from "@/lib/PlaylistContext";
import { mockTauriApi, mockState } from "@/lib/tauri-api.mock";
import { sanitizeFolderName, buildCollectionId } from "@/utils/media-helpers";
import type { ReactNode } from "react";

// Wrapper with TauriApiProvider
function wrapper({ children }: { children: ReactNode }) {
  return (
    <TauriApiProvider api={mockTauriApi}>
      <PlaylistProvider>{children}</PlaylistProvider>
    </TauriApiProvider>
  );
}

describe("useMediaList", () => {
  beforeEach(() => {
    mockState.reset();
    vi.clearAllMocks();
  });

  describe("addMediaUrl", () => {
    it("adds a new URL to the list", () => {
      const { result } = renderHook(() => useMediaList(), { wrapper });

      act(() => {
        result.current.addMediaUrl("https://example.com/video1");
      });

      expect(result.current.mediaList).toHaveLength(1);
      expect(result.current.mediaList[0]).toMatchObject({
        url: "https://example.com/video1",
        status: "Pending",
        progress: 0,
      });
    });

    it("does not add duplicate URLs", () => {
      const { result } = renderHook(() => useMediaList(), { wrapper });

      act(() => {
        result.current.addMediaUrl("https://example.com/video1");
      });

      act(() => {
        result.current.addMediaUrl("https://example.com/video1");
      });

      expect(result.current.mediaList).toHaveLength(1);
    });

    it("adds multiple different URLs", () => {
      const { result } = renderHook(() => useMediaList(), { wrapper });

      act(() => {
        result.current.addMediaUrl("https://example.com/video1");
        result.current.addMediaUrl("https://example.com/video2");
        result.current.addMediaUrl("https://example.com/video3");
      });

      expect(result.current.mediaList).toHaveLength(3);
    });

    it("calls getMediaInfo for new URLs", async () => {
      const getMediaInfoSpy = vi.spyOn(mockTauriApi.commands, "getMediaInfo");
      const { result } = renderHook(() => useMediaList(), { wrapper });

      act(() => {
        result.current.addMediaUrl("https://example.com/video1");
      });

      await waitFor(() => {
        expect(getMediaInfoSpy).toHaveBeenCalledWith(0, "https://example.com/video1");
      });
    });
  });

  describe("updateMediaItem", () => {
    it("updates existing item by URL", () => {
      const { result } = renderHook(() => useMediaList(), { wrapper });

      act(() => {
        result.current.addMediaUrl("https://example.com/video1");
      });

      act(() => {
        result.current.updateMediaItem({
          url: "https://example.com/video1",
          title: "Updated Title",
          status: "Downloading",
        });
      });

      expect(result.current.mediaList[0]).toMatchObject({
        url: "https://example.com/video1",
        title: "Updated Title",
        status: "Downloading",
      });
    });

    it("preserves existing values when updating partially", () => {
      const { result } = renderHook(() => useMediaList(), { wrapper });

      act(() => {
        result.current.addMediaUrl("https://example.com/video1");
      });

      act(() => {
        result.current.updateMediaItem({
          url: "https://example.com/video1",
          progress: 50,
        });
      });

      expect(result.current.mediaList[0]).toMatchObject({
        url: "https://example.com/video1",
        progress: 50,
        status: "Pending", // Should preserve original
      });
    });

    it("adds item if URL does not exist", () => {
      const { result } = renderHook(() => useMediaList(), { wrapper });

      act(() => {
        result.current.updateMediaItem({
          url: "https://example.com/new",
          title: "New Video",
        });
      });

      expect(result.current.mediaList).toHaveLength(1);
      expect(result.current.mediaList[0]?.title).toBe("New Video");
    });

    it("ignores updates without URL", () => {
      const { result } = renderHook(() => useMediaList(), { wrapper });

      act(() => {
        result.current.addMediaUrl("https://example.com/video1");
      });

      act(() => {
        result.current.updateMediaItem({ title: "No URL" });
      });

      // Should not add new item or crash
      expect(result.current.mediaList).toHaveLength(1);
    });
  });

  describe("updateMediaItemByIndex", () => {
    it("updates item at valid index", () => {
      const { result } = renderHook(() => useMediaList(), { wrapper });

      act(() => {
        result.current.addMediaUrl("https://example.com/video1");
        result.current.addMediaUrl("https://example.com/video2");
      });

      act(() => {
        result.current.updateMediaItemByIndex(1, {
          status: "Done",
          progress: 100,
        });
      });

      expect(result.current.mediaList[1]).toMatchObject({
        status: "Done",
        progress: 100,
      });
    });

    it("ignores updates at invalid index (negative)", () => {
      const { result } = renderHook(() => useMediaList(), { wrapper });

      act(() => {
        result.current.addMediaUrl("https://example.com/video1");
      });

      const originalList = [...result.current.mediaList];

      act(() => {
        result.current.updateMediaItemByIndex(-1, { status: "Done" });
      });

      expect(result.current.mediaList).toEqual(originalList);
    });

    it("ignores updates at invalid index (out of bounds)", () => {
      const { result } = renderHook(() => useMediaList(), { wrapper });

      act(() => {
        result.current.addMediaUrl("https://example.com/video1");
      });

      const originalList = [...result.current.mediaList];

      act(() => {
        result.current.updateMediaItemByIndex(99, { status: "Done" });
      });

      expect(result.current.mediaList).toEqual(originalList);
    });
  });

  describe("removeItem", () => {
    it("removes item by title", () => {
      const { result } = renderHook(() => useMediaList(), { wrapper });

      act(() => {
        result.current.addMediaUrl("https://example.com/video1");
      });

      act(() => {
        result.current.updateMediaItem({
          url: "https://example.com/video1",
          title: "Video 1",
        });
      });

      act(() => {
        result.current.removeItem("https://example.com/video1");
      });

      expect(result.current.mediaList).toHaveLength(0);
    });

    it("does nothing if title not found", () => {
      const { result } = renderHook(() => useMediaList(), { wrapper });

      act(() => {
        result.current.addMediaUrl("https://example.com/video1");
      });

      act(() => {
        result.current.removeItem("nonexistent-id");
      });

      expect(result.current.mediaList).toHaveLength(1);
    });
  });

  describe("removeAll", () => {
    it("clears all items from the list", () => {
      const { result } = renderHook(() => useMediaList(), { wrapper });

      act(() => {
        result.current.addMediaUrl("https://example.com/video1");
        result.current.addMediaUrl("https://example.com/video2");
        result.current.addMediaUrl("https://example.com/video3");
      });

      expect(result.current.mediaList).toHaveLength(3);

      act(() => {
        result.current.removeAll();
      });

      expect(result.current.mediaList).toHaveLength(0);
    });

    it("works on empty list", () => {
      const { result } = renderHook(() => useMediaList(), { wrapper });

      act(() => {
        result.current.removeAll();
      });

      expect(result.current.mediaList).toHaveLength(0);
    });
  });

  describe("removeItemsAtIndices", () => {
    it("removes items at specified indices", () => {
      const { result } = renderHook(() => useMediaList(), { wrapper });

      act(() => {
        result.current.addMediaUrl("https://example.com/video1");
        result.current.addMediaUrl("https://example.com/video2");
        result.current.addMediaUrl("https://example.com/video3");
      });

      act(() => {
        result.current.removeItemsAtIndices(new Set([0, 2]));
      });

      expect(result.current.mediaList).toHaveLength(1);
      expect(result.current.mediaList[0]?.url).toBe("https://example.com/video2");
    });

    it("handles empty set", () => {
      const { result } = renderHook(() => useMediaList(), { wrapper });

      act(() => {
        result.current.addMediaUrl("https://example.com/video1");
      });

      act(() => {
        result.current.removeItemsAtIndices(new Set());
      });

      expect(result.current.mediaList).toHaveLength(1);
    });

    it("handles indices out of bounds gracefully", () => {
      const { result } = renderHook(() => useMediaList(), { wrapper });

      act(() => {
        result.current.addMediaUrl("https://example.com/video1");
      });

      act(() => {
        result.current.removeItemsAtIndices(new Set([5, 10, 99]));
      });

      expect(result.current.mediaList).toHaveLength(1);
    });
  });

  describe("playlist expansion metadata", () => {
    it("sets subfolder and collection metadata from playlist expansion", async () => {
      const { result } = renderHook(() => useMediaList(), { wrapper });

      mockState.playlistExpansion = {
        playlistName: "My Playlist",
        uploader: "Test Channel",
        entries: [
          { url: "https://example.com/a", title: "First" },
          { url: "https://example.com/b", title: "Second" },
        ],
      };

      act(() => {
        result.current.addMediaUrl("https://example.com/playlist");
      });

      await waitFor(() => {
        expect(result.current.mediaList).toHaveLength(2);
      });

      const first = result.current.mediaList[0]!;
      expect(first.subfolder).toBe(sanitizeFolderName("My Playlist"));
      expect(first.collectionType).toBe("playlist");
      expect(first.collectionName).toBe("My Playlist");
      expect(first.folderSlug).toBe(sanitizeFolderName("My Playlist"));
      expect(first.collectionId).toBe(
        buildCollectionId("playlist", {
          name: "My Playlist",
          url: "https://example.com/playlist",
        }),
      );
    });
  });
});
