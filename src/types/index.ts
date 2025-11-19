// Centralized shared types for TS <-> Rust payloads and event names

// Tauri event payloads
// [mediaIdx, progress]
export type MediaProgressEvent = [number, number];
// [mediaIdx, mediaSourceUrl, title, thumbnail]
export type MediaInfoEvent = [number, string, string, string];

// Tauri event name constants
export const TAURI_EVENT = {
  updateMediaInfo: "update-media-info",
  downloadProgress: "download-progress",
  downloadComplete: "download-complete",
  downloadError: "download-error",
} as const;
export type TauriEventName = (typeof TAURI_EVENT)[keyof typeof TAURI_EVENT];

// Tauri command payloads (for invoke)
export interface DownloadMediaCommand {
  mediaIdx: number;
  mediaSourceUrl: string;
  outputLocation: string;
}

export interface GetMediaInfoCommand {
  mediaIdx: number;
  mediaSourceUrl: string;
}

export type QuitCommand = undefined;
