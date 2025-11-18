/**
 * useDownloadManager Hook
 *
 * Manages download operations and global download state.
 */

import { useState, useCallback, useEffect } from "react";
import { useAtomValue } from "jotai";
import {
	downloadLocationAtom,
	downloadModeAtom,
	videoQualityAtom,
	maxResolutionAtom,
	videoFormatAtom,
	audioFormatAtom,
	audioQualityAtom
} from "@/state/settings-atoms";
import { calculateGlobalProgress, hasActiveDownloads } from "@/utils/media-helpers";
import type { DownloadSettings } from "@/types";
import { useTauriApi } from "@/lib/TauriApiContext";
import type { VideoInfo } from "@/components/MediaTable";

export function useDownloadManager(mediaList: VideoInfo[]) {
	const [globalProgress, setGlobalProgress] = useState(0);
	const [globalDownloading, setGlobalDownloading] = useState(false);

	const tauriApi = useTauriApi();

	// Read download settings
	const outputLocation = useAtomValue(downloadLocationAtom);
	const downloadMode = useAtomValue(downloadModeAtom);
	const videoQuality = useAtomValue(videoQualityAtom);
	const maxResolution = useAtomValue(maxResolutionAtom);
	const videoFormat = useAtomValue(videoFormatAtom);
	const audioFormat = useAtomValue(audioFormatAtom);
	const audioQuality = useAtomValue(audioQualityAtom);

	/**
	 * Start download for all media in the list
	 */
	const startDownload = useCallback(async () => {
		setGlobalProgress(0);
		setGlobalDownloading(true);

		// Collect current settings
		const settings: DownloadSettings = {
			downloadMode,
			videoQuality,
			maxResolution,
			videoFormat,
			audioFormat,
			audioQuality
		};

		try {
			await Promise.all(
				mediaList.map((media, i) =>
					tauriApi.commands.downloadMedia(i, media.url, outputLocation, settings)
				)
			);
		} catch (err) {
			console.error("Error starting download:", err);
			alert("Error starting download");
			setGlobalDownloading(false);
		}
	}, [
		mediaList,
		outputLocation,
		downloadMode,
		videoQuality,
		maxResolution,
		videoFormat,
		audioFormat,
		audioQuality,
		tauriApi.commands
	]);

	/**
	 * Cancel all active downloads
	 */
	const cancelAllDownloads = useCallback(async () => {
		try {
			await tauriApi.commands.cancelAllDownloads();
			console.log("Cancel all downloads requested");
		} catch (error) {
			console.error("Failed to cancel downloads:", error);
		}
	}, [tauriApi.commands]);

	/**
	 * Update global download state based on media list
	 */
	useEffect(() => {
		const isDownloading = hasActiveDownloads(mediaList);
		setGlobalDownloading(isDownloading);
		setGlobalProgress(isDownloading ? calculateGlobalProgress(mediaList) : 0);
	}, [mediaList]);

	return {
		globalProgress,
		globalDownloading,
		startDownload,
		cancelAllDownloads
	};
}
