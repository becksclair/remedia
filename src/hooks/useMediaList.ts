/**
 * useMediaList Hook
 *
 * Manages media list state and operations.
 */

import { useState, useCallback } from "react";
import { createMediaItem, urlExists, type VideoInfo } from "@/utils/media-helpers";
import { useTauriApi } from "@/lib/TauriApiContext";
import { usePlaylistContext } from "@/lib/PlaylistContext";

export function useMediaList() {
  const [mediaList, setMediaList] = useState<VideoInfo[]>([]);
  const tauriApi = useTauriApi();
  const { expandPlaylist } = usePlaylistContext();

  /**
   * Add a media URL to the list
   */
  const addMediaUrl = useCallback(
    (url: string) => {
      const placeholderIdxPromise = new Promise<number | null>((resolve) => {
        setMediaList((prevList) => {
          if (urlExists(prevList, url)) {
            console.log("URL already exists in the list");
            resolve(null);
            return prevList;
          }

          const nextList = [...prevList, createMediaItem(url)];
          resolve(nextList.length - 1);
          return nextList;
        });
      });

      void (async () => {
        const placeholderIdx = await placeholderIdxPromise;
        if (placeholderIdx === null) return;

        const expanded = await expandPlaylist(url);

        if (expanded.length > 0) {
          setMediaList((prevList) => {
            // Remove the placeholder we inserted for the playlist URL
            const withoutPlaceholder = prevList.filter((item) => item.url !== url);
            const next = [...withoutPlaceholder];
            const additions: Array<{ url: string; idx: number; title?: string }> = [];

            expanded.forEach((entry) => {
              if (!entry.url || urlExists(next, entry.url)) return;

              const idx = next.length;
              additions.push({ url: entry.url, idx, title: entry.title });
              next.push({
                ...createMediaItem(entry.url),
                title: entry.title ?? entry.url,
              });
            });

            queueMicrotask(() => {
              additions.forEach(({ url: mediaSourceUrl, idx }) => {
                void tauriApi.commands.getMediaInfo(idx, mediaSourceUrl).catch((error) =>
                  console.warn("getMediaInfo failed; using placeholder metadata", {
                    url: mediaSourceUrl,
                    error,
                  }),
                );
              });
            });

            return next;
          });

          return;
        }

        void tauriApi.commands.getMediaInfo(placeholderIdx, url).catch((error) =>
          console.warn("getMediaInfo failed; using placeholder metadata", {
            url,
            error,
          }),
        );
      })();
    },
    [expandPlaylist, tauriApi.commands],
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
          id: existing.id ?? url,
        };
        const next = [...prevList];
        next[idx] = merged;
        return next;
      }

      const defaultItem: VideoInfo = {
        id: url,
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
        id: defaultItem.id,
      };

      return [...prevList, newItem];
    });
  }, []);

  /**
   * Update media item by index
   */
  const updateMediaItemByIndex = useCallback((index: number, updates: Partial<VideoInfo>): void => {
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
  }, []);

  /**
   * Remove an item by title
   */
  const removeItem = useCallback((id: string) => {
    setMediaList((prevList) => prevList.filter((item) => item.id !== id));
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
    setMediaList((prevList) => prevList.filter((_, index) => !indices.has(index)));
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
