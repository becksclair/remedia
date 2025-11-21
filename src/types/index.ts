// Centralized shared types for TS <-> Rust payloads and event names

// Tauri event payloads
// [mediaIdx, progress]
export type MediaProgressEvent = [number, number];
// [mediaIdx, mediaSourceUrl, title, thumbnail]
export type MediaInfoEvent = [number, string, string, string];
// [mediaIdx, stderrLine]
export type YtDlpStderrEvent = [number, string];

// Tauri event name constants
export const TAURI_EVENT = {
  updateMediaInfo: "update-media-info",
  downloadProgress: "download-progress",
  downloadComplete: "download-complete",
  downloadError: "download-error",
  ytDlpStderr: "yt-dlp-stderr",
} as const;
export type TauriEventName = (typeof TAURI_EVENT)[keyof typeof TAURI_EVENT];

// Tauri command payloads (for invoke)
export interface DownloadSettings {
  downloadMode: "video" | "audio";
  videoQuality: "best" | "high" | "medium" | "low";
  maxResolution: "2160p" | "1440p" | "1080p" | "720p" | "480p" | "no-limit";
  videoFormat: "mp4" | "mkv" | "webm" | "best";
  audioFormat: "mp3" | "m4a" | "opus" | "best";
  audioQuality: "0" | "2" | "5" | "9";
}

export interface DownloadMediaCommand {
  mediaIdx: number;
  mediaSourceUrl: string;
  outputLocation: string;
  settings: DownloadSettings;
}

export interface GetMediaInfoCommand {
  mediaIdx: number;
  mediaSourceUrl: string;
}

export type QuitCommand = undefined;
