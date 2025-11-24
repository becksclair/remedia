/**
 * useMediaList Hook
 *
 * Manages media list state and operations.
 */

import { useState, useCallback } from "react";
import { createMediaItem, urlExists } from "@/utils/media-helpers";
import type { VideoInfo } from "@/components/MediaTable";
import { useTauriApi } from "@/lib/TauriApiContext";

export function useMediaList() {
  const [mediaList, setMediaList] = useState<VideoInfo[]>([]);
  const tauriApi = useTauriApi();

  /**
   * Add a media URL to the list
   */
  const addMediaUrl = useCallback(
    (url: string) => {
      setMediaList((prevList) => {
        if (urlExists(prevList, url)) {
          console.log("URL already exists in the list");
          return prevList;
        }

        const nextList = [...prevList, createMediaItem(url)];
        const mediaIdx = nextList.length - 1;

        // Request media information using the new index
        void tauriApi.commands.getMediaInfo(mediaIdx, url);

        return nextList;
      });
    },
    [tauriApi.commands],
  );

  /**
   * Update media item by merging updates
   */
  const updateMediaItem = useCallback((updates: Partial<VideoInfo>): void => {
    const url = updates.url;
    if (!url) return;

    setMediaList((prevList) => {
      const idx = prevList.findIndex((item) => item.url === url);

      if (idx !== -1) {
        const existing = prevList[idx];
        if (!existing) return prevList;
        const merged: VideoInfo = {
          ...existing,
          ...updates,
          progress: updates.progress ?? existing.progress,
          status: updates.status ?? existing.status,
          audioOnly: updates.audioOnly ?? existing.audioOnly,
          thumbnail: updates.thumbnail ?? existing.thumbnail,
          title: updates.title ?? existing.title,
          url,
        };
        const next = [...prevList];
        next[idx] = merged;
        return next;
      }

      const defaultItem: VideoInfo = {
        audioOnly: false,
        progress: 0,
        status: updates.status ?? "Pending",
        title: updates.title ?? url,
        url,
        thumbnail: updates.thumbnail,
      };

      const newItem: VideoInfo = {
        ...defaultItem,
        ...updates,
        title: updates.title ?? defaultItem.title,
        url,
      };

      return [...prevList, newItem];
    });
  }, []);

  /**
   * Update media item by index
   */
  const updateMediaItemByIndex = useCallback(
    (index: number, updates: Partial<VideoInfo>): void => {
      setMediaList((prev) => {
        if (index < 0 || index >= prev.length) return prev;
        const next = [...prev];
        const existing = next[index];
        if (!existing) return prev;
        next[index] = {
          ...existing,
          ...updates,
          title: updates.title ?? existing.title,
          url: existing.url,
        };
        return next;
      });
    },
    [],
  );

  /**
   * Remove an item by title
   */
  const removeItem = useCallback((title: string) => {
    setMediaList((prevList) => prevList.filter((item) => item.title !== title));
  }, []);

  /**
   * Remove all items
   */
  const removeAll = useCallback(() => {
    setMediaList([]);
  }, []);

  /**
   * Remove items at specific indices
   */
  const removeItemsAtIndices = useCallback((indices: Set<number>) => {
    setMediaList((prevList) =>
      prevList.filter((_, index) => !indices.has(index)),
    );
  }, []);

  return {
    mediaList,
    addMediaUrl,
    updateMediaItem,
    updateMediaItemByIndex,
    removeItem,
    removeAll,
    removeItemsAtIndices,
  };
}
