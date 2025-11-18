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
			// Check if URL already exists
			if (urlExists(mediaList, url)) {
				console.log("URL already exists in the list");
				return;
			}

			const newMedia = createMediaItem(url);
			const updatedMediaList = [...mediaList, newMedia];
			const mediaIdx = updatedMediaList.findIndex(m => m.url === url);

			setMediaList(updatedMediaList);

			// Request media information
			void tauriApi.commands.getMediaInfo(mediaIdx, url);
		},
		[mediaList, tauriApi.commands]
	);

	/**
	 * Update media item by merging updates
	 */
	const updateMediaItem = useCallback((updates: Partial<VideoInfo>): void => {
		if (!updates.url) return;

		setMediaList(prevList => {
			// Remove any items where title equals updates.url
			const filtered = prevList.filter(item => item.title !== updates.url);

			const newMedia = {
				audioOnly: false,
				progress: 0,
				status: "Pending",
				title: updates.title ?? updates.url,
				url: updates.url,
				thumbnail: updates.thumbnail
			} as VideoInfo;

			// If filtered contains an item with the same title as updates.title, merge it
			const idx = filtered.findIndex(item => item.title === updates.title);

			if (idx !== -1) {
				const existing = filtered[idx];
				if (existing) {
					const merged: VideoInfo = {
						...existing,
						...updates,
						url: existing.url,
						title: updates.title ?? existing.title
					};
					filtered[idx] = merged;
				}
			} else {
				filtered.push(newMedia);
			}

			return [...filtered];
		});
	}, []);

	/**
	 * Update media item by index
	 */
	const updateMediaItemByIndex = useCallback((index: number, updates: Partial<VideoInfo>): void => {
		setMediaList(prev => {
			if (index < 0 || index >= prev.length) return prev;
			const next = [...prev];
			const existing = next[index];
			if (!existing) return prev;
			next[index] = {
				...existing,
				...updates,
				title: updates.title ?? existing.title,
				url: existing.url
			};
			return next;
		});
	}, []);

	/**
	 * Remove an item by title
	 */
	const removeItem = useCallback((title: string) => {
		setMediaList(prevList => prevList.filter(item => item.title !== title));
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
		setMediaList(prevList => prevList.filter((_, index) => !indices.has(index)));
	}, []);

	return {
		mediaList,
		addMediaUrl,
		updateMediaItem,
		updateMediaItemByIndex,
		removeItem,
		removeAll,
		removeItemsAtIndices
	};
}
