/**
 * useMediaList Hook
 *
 * Manages media list state and operations.
 * Uses a single Map for O(1) lookups - Map preserves insertion order in ES6+.
 */

import { useState, useCallback, useMemo, useRef } from "react";
import { useSetAtom } from "jotai";
import {
  createMediaItem,
  sanitizeFolderName,
  buildCollectionId,
  type VideoInfo,
  type CollectionKind,
} from "@/utils/media-helpers";
import { useTauriApi } from "@/lib/TauriApiContext";
import { usePlaylistContext } from "@/lib/PlaylistContext";
import { upsertCollectionsAtom } from "@/state/collection-atoms";

/** Max concurrent metadata fetches to avoid overwhelming backend */
const METADATA_CONCURRENCY = 5;

export function useMediaList() {
  // Single Map state - preserves insertion order in ES6+
  const [mediaMap, setMediaMap] = useState<Map<string, VideoInfo>>(new Map());

  // Ref for synchronous access to current map (avoids Promise-in-setState)
  // Updated synchronously inside setState callbacks to stay in sync
  const mediaMapRef = useRef<Map<string, VideoInfo>>(new Map());

  const tauriApi = useTauriApi();
  const { expandPlaylist } = usePlaylistContext();
  const upsertCollections = useSetAtom(upsertCollectionsAtom);

  // Derive array for external consumption (memoized)
  const mediaList = useMemo(() => Array.from(mediaMap.values()), [mediaMap]);

  /**
   * Helper to find URL index in the map
   */
  const findUrlIndex = useCallback((targetUrl: string): number => {
    let index = 0;
    for (const url of mediaMapRef.current.keys()) {
      if (url === targetUrl) return index;
      index++;
    }
    return -1;
  }, []);

  /**
   * Add a media URL to the list
   */
  const addMediaUrl = useCallback(
    (url: string) => {
      // Check if already exists using ref (synchronous)
      if (mediaMapRef.current.has(url)) {
        console.log("URL already exists in the list");
        return;
      }

      // Add placeholder item and update ref synchronously
      setMediaMap((prev) => {
        if (prev.has(url)) return prev;
        const next = new Map(prev);
        next.set(url, createMediaItem(url));
        mediaMapRef.current = next; // Keep ref in sync
        return next;
      });

      void (async () => {
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

          // Build new items
          const newItems: VideoInfo[] = [];
          expansion.entries.forEach((entry) => {
            if (!entry.url) return;
            newItems.push({
              ...createMediaItem(entry.url),
              title: entry.title ?? entry.url,
              subfolder,
              collectionType,
              collectionName,
              folderSlug,
              collectionId,
            });
          });

          // Pre-compute URLs to add (use ref to check for duplicates)
          const newUrls = newItems
            .map((item) => item.url)
            .filter((itemUrl) => itemUrl !== url && !mediaMapRef.current.has(itemUrl));

          // Single atomic state update - remove placeholder, add entries
          setMediaMap((prev) => {
            const next = new Map(prev);
            next.delete(url); // Remove playlist placeholder

            for (const item of newItems) {
              if (!next.has(item.url)) {
                next.set(item.url, item);
              }
            }

            mediaMapRef.current = next; // Keep ref in sync
            return next;
          });

          // Wait a tick for React to commit state, then fetch metadata
          // Use setTimeout(0) to ensure state is flushed before we compute indices
          setTimeout(async () => {
            // Chunked metadata fetching with concurrency control
            for (let i = 0; i < newUrls.length; i += METADATA_CONCURRENCY) {
              const chunk = newUrls.slice(i, i + METADATA_CONCURRENCY);
              await Promise.all(
                chunk.map((mediaSourceUrl) => {
                  const idx = findUrlIndex(mediaSourceUrl);
                  if (idx < 0) return Promise.resolve();
                  return tauriApi.commands.getMediaInfo(idx, mediaSourceUrl).catch((error) =>
                    console.warn("getMediaInfo failed; using placeholder metadata", {
                      url: mediaSourceUrl,
                      error,
                    }),
                  );
                }),
              );
            }
          }, 0);

          return;
        }

        // Single video - find current index (state is now committed)
        const currentIdx = findUrlIndex(url);
        if (currentIdx >= 0) {
          void tauriApi.commands.getMediaInfo(currentIdx, url).catch((error) =>
            console.warn("getMediaInfo failed; using placeholder metadata", {
              url,
              error,
            }),
          );
        }
      })();
    },
    [expandPlaylist, findUrlIndex, tauriApi.commands, upsertCollections],
  );

  /**
   * Update media item by merging updates (O(1) lookup)
   */
  const updateMediaItem = useCallback((updates: Partial<VideoInfo>): void => {
    const url = updates.url;
    if (!url) return;

    setMediaMap((prev) => {
      const existing = prev.get(url);

      if (existing) {
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
        const next = new Map(prev);
        next.set(url, merged);
        mediaMapRef.current = next; // Keep ref in sync
        return next;
      }

      // Item doesn't exist - create new
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

      const next = new Map(prev);
      next.set(url, newItem);
      mediaMapRef.current = next; // Keep ref in sync
      return next;
    });
  }, []);

  /**
   * Update media item by index (iterates Map entries to find by position)
   */
  const updateMediaItemByIndex = useCallback((index: number, updates: Partial<VideoInfo>): void => {
    setMediaMap((prev) => {
      const entries = Array.from(prev.entries());
      if (index < 0 || index >= entries.length) return prev;

      const [url, existing] = entries[index]!;
      const next = new Map(prev);
      next.set(url, {
        ...existing,
        ...updates,
        title: updates.title ?? existing.title,
        url: existing.url,
      });
      mediaMapRef.current = next; // Keep ref in sync
      return next;
    });
  }, []);

  /**
   * Remove an item by id (typically the URL)
   */
  const removeItem = useCallback((id: string) => {
    setMediaMap((prev) => {
      const next = new Map(prev);
      // Find and delete by id
      for (const [url, item] of next) {
        if (item.id === id) {
          next.delete(url);
          break;
        }
      }
      mediaMapRef.current = next; // Keep ref in sync
      return next;
    });
  }, []);

  /**
   * Remove all items
   */
  const removeAll = useCallback(() => {
    const empty = new Map<string, VideoInfo>();
    mediaMapRef.current = empty; // Keep ref in sync
    setMediaMap(empty);
  }, []);

  /**
   * Remove items at specific indices
   */
  const removeItemsAtIndices = useCallback((indices: Set<number>) => {
    setMediaMap((prev) => {
      const entries = Array.from(prev.entries());
      const next = new Map<string, VideoInfo>();
      entries.forEach(([url, item], idx) => {
        if (!indices.has(idx)) {
          next.set(url, item);
        }
      });
      mediaMapRef.current = next; // Keep ref in sync
      return next;
    });
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
