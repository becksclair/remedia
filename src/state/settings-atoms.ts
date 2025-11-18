import { atomWithStorage } from "jotai/utils";

// Window settings
export const alwaysOnTopAtom = atomWithStorage("alwaysOnTop", false);
export const downloadLocationAtom = atomWithStorage<string>("downloadLocation", "");

// Download mode settings (Phase 3.1)
export type DownloadMode = "video" | "audio";
export const downloadModeAtom = atomWithStorage<DownloadMode>("downloadMode", "video");

// Video quality settings
export type VideoQuality = "best" | "high" | "medium" | "low";
export const videoQualityAtom = atomWithStorage<VideoQuality>("videoQuality", "best");

// Max resolution settings
export type MaxResolution = "2160p" | "1440p" | "1080p" | "720p" | "480p" | "no-limit";
export const maxResolutionAtom = atomWithStorage<MaxResolution>("maxResolution", "no-limit");

// Video format settings
export type VideoFormat = "mp4" | "mkv" | "webm" | "best";
export const videoFormatAtom = atomWithStorage<VideoFormat>("videoFormat", "best");

// Audio format settings
export type AudioFormat = "mp3" | "m4a" | "opus" | "best";
export const audioFormatAtom = atomWithStorage<AudioFormat>("audioFormat", "best");

// Audio quality settings (yt-dlp scale: 0=best, 9=worst)
export type AudioQuality = "0" | "2" | "5" | "9";
export const audioQualityAtom = atomWithStorage<AudioQuality>("audioQuality", "0");

// Concurrency settings (Phase 6.1)
export const maxConcurrentDownloadsAtom = atomWithStorage<number>("maxConcurrentDownloads", 3);
