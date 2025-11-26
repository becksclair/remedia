import { atomWithStorage, createJSONStorage } from "jotai/utils";

// Window settings
export const alwaysOnTopAtom = atomWithStorage("alwaysOnTop", false);
export const downloadLocationAtom = atomWithStorage<string>(
  "downloadLocation",
  "",
);

// Download mode settings (Phase 3.1)
export type DownloadMode = "video" | "audio";
export const downloadModeAtom = atomWithStorage<DownloadMode>(
  "downloadMode",
  "video",
);

// Video quality settings
export type VideoQuality = "best" | "high" | "medium" | "low";
export const videoQualityAtom = atomWithStorage<VideoQuality>(
  "videoQuality",
  "best",
);

// Max resolution settings
export type MaxResolution =
  | "2160p"
  | "1440p"
  | "1080p"
  | "720p"
  | "480p"
  | "no-limit";
export const maxResolutionAtom = atomWithStorage<MaxResolution>(
  "maxResolution",
  "no-limit",
);

// Video format settings
export type VideoFormat = "mp4" | "mkv" | "webm" | "best";
export const videoFormatAtom = atomWithStorage<VideoFormat>(
  "videoFormat",
  "best",
);

// Audio format settings
export type AudioFormat = "mp3" | "m4a" | "opus" | "best";
export const audioFormatAtom = atomWithStorage<AudioFormat>(
  "audioFormat",
  "best",
);

// Audio quality settings (yt-dlp scale: 0=best, 9=worst)
export type AudioQuality = "0" | "2" | "5" | "9";
export const audioQualityAtom = atomWithStorage<AudioQuality>(
  "audioQuality",
  "0",
  {
    ...createJSONStorage<AudioQuality>(() => localStorage),
    getItem: (key, initialValue) => {
      const storage = createJSONStorage<AudioQuality>(() => localStorage);
      const value = storage.getItem(key, initialValue);
      const validValues: AudioQuality[] = ["0", "2", "5", "9"];
      return validValues.includes(value as AudioQuality) ? value : "0";
    },
  },
);

// Concurrency settings (Phase 6.1)
export const maxConcurrentDownloadsAtom = atomWithStorage<number>(
  "maxConcurrentDownloads",
  3,
);

// Rate limiting settings
export type DownloadRateLimit =
  | "unlimited"
  | "50K"
  | "100K"
  | "500K"
  | "1M"
  | "5M"
  | "10M";
export const downloadRateLimitAtom = atomWithStorage<DownloadRateLimit>(
  "downloadRateLimit",
  "unlimited",
);

// File size limit settings
export type MaxFileSize = "unlimited" | "50M" | "100M" | "500M" | "1G" | "5G";
export const maxFileSizeAtom = atomWithStorage<MaxFileSize>(
  "maxFileSize",
  "unlimited",
);

// Theme settings
export type Theme = "system" | "light" | "dark";
export const themeAtom = atomWithStorage<Theme>("theme", "system");

// Filename unique ID toggle (appends short ID to filenames for uniqueness)
export const appendUniqueIdAtom = atomWithStorage<boolean>(
  "appendUniqueId",
  true,
);

// Unique ID type: "native" uses yt-dlp's video ID (truly idempotent per video),
// "hash" uses a short FNV-1a hash of URL (consistent 8-char format)
export type UniqueIdType = "native" | "hash";
export const uniqueIdTypeAtom = atomWithStorage<UniqueIdType>(
  "uniqueIdType",
  "native",
);
