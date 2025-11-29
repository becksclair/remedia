/**
 * useMediaList Hook
 *
 * Manages media list state and operations.
 */

import { useState, useCallback } from "react";
import { useSetAtom } from "jotai";
import {
  createMediaItem,
  urlExists,
  sanitizeFolderName,
  buildCollectionId,
  type VideoInfo,
  type CollectionKind,
} from "@/utils/media-helpers";
import { useTauriApi } from "@/lib/TauriApiContext";
import { usePlaylistContext } from "@/lib/PlaylistContext";
import { upsertCollectionsAtom } from "@/state/collection-atoms";

export function useMediaList() {
  const [mediaList, setMediaList] = useState<VideoInfo[]>([]);
  const tauriApi = useTauriApi();
  const { expandPlaylist } = usePlaylistContext();
  const upsertCollections = useSetAtom(upsertCollectionsAtom);

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

        const expansion = await expandPlaylist(url);

        if (expansion.entries.length > 0) {
          // Prefer backend-provided collection metadata when available
          const backendKind = expansion.collectionKind as CollectionKind | undefined;
          const backendName =
            expansion.collectionName ?? expansion.playlistName ?? expansion.uploader;
          const backendSlug =
            expansion.folderSlug ?? (backendName ? sanitizeFolderName(backendName) : undefined);

          const collectionType: CollectionKind =
            backendKind ??
            (expansion.playlistName ? "playlist" : expansion.uploader ? "channel" : "single");

          const collectionName = backendName ?? undefined;
          const folderSlug = backendSlug;

          const subfolder =
            backendSlug ?? backendName ?? expansion.playlistName ?? expansion.uploader;

          const collectionId =
            expansion.collectionId ??
            buildCollectionId(collectionType, {
              name: collectionName,
              url,
            });

          if (collectionId && collectionType && collectionName && folderSlug) {
            upsertCollections({
              id: collectionId,
              kind: collectionType,
              name: collectionName,
              slug: folderSlug,
            });
          }

          setMediaList((prevList) => {
            // Remove the placeholder we inserted for the playlist URL
            const withoutPlaceholder = prevList.filter((item) => item.url !== url);
            const next = [...withoutPlaceholder];
            const additions: Array<{ url: string; idx: number; title?: string }> = [];

            expansion.entries.forEach((entry) => {
              if (!entry.url || urlExists(next, entry.url)) return;

              const idx = next.length;
              additions.push({ url: entry.url, idx, title: entry.title });
              next.push({
                ...createMediaItem(entry.url),
                title: entry.title ?? entry.url,
                subfolder,
                collectionType,
                collectionName,
                folderSlug,
                collectionId,
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
    [expandPlaylist, tauriApi.commands, upsertCollections],
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
          // Keep existing subfolder if set (playlist items), otherwise use update
          subfolder: existing.subfolder ?? updates.subfolder,
          collectionType: existing.collectionType ?? updates.collectionType,
          collectionName: existing.collectionName ?? updates.collectionName,
          collectionId: existing.collectionId ?? updates.collectionId,
          folderSlug: existing.folderSlug ?? updates.folderSlug,
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
        subfolder: updates.subfolder,
        collectionId: updates.collectionId,
        folderSlug: updates.folderSlug,
        collectionType: updates.collectionType,
        collectionName: updates.collectionName,
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
