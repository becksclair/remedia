// Centralized shared types for TS <-> Rust payloads and event names

// Tauri event payloads
// [mediaIdx, progress]
export type MediaProgressEvent = [number, number];
// [
//   mediaIdx,
//   mediaSourceUrl,
//   title,
//   thumbnail,
//   previewUrl,
//   uploader,
//   collectionId,
//   collectionKind,
//   collectionName,
//   folderSlug,
// ]
export type MediaInfoEvent = [
  number,
  string,
  string,
  string,
  string,
  string | null,
  string | null,
  ("playlist" | "channel" | "single") | null,
  string | null,
  string | null,
];
// [mediaIdx, stderrLine]
export type YtDlpStderrEvent = [number, string];

// Tauri event name constants
export const TAURI_EVENT = {
  updateMediaInfo: "update-media-info",
  downloadProgress: "download-progress",
  downloadComplete: "download-complete",
  downloadError: "download-error",
  downloadCancelled: "download-cancelled",
  downloadQueued: "download-queued",
  downloadStarted: "download-started",
  ytDlpStderr: "yt-dlp-stderr",
  remoteAddUrl: "remote-add-url",
  remoteStartDownloads: "remote-start-downloads",
  remoteCancelDownloads: "remote-cancel-downloads",
  remoteClearList: "remote-clear-list",
  remoteSetDownloadDir: "remote-set-download-dir",
} as const;

export type TauriEventName = (typeof TAURI_EVENT)[keyof typeof TAURI_EVENT];

export type DownloadEventName =
  | (typeof TAURI_EVENT)["downloadProgress"]
  | (typeof TAURI_EVENT)["downloadComplete"]
  | (typeof TAURI_EVENT)["downloadError"]
  | (typeof TAURI_EVENT)["downloadCancelled"]
  | (typeof TAURI_EVENT)["downloadQueued"]
  | (typeof TAURI_EVENT)["downloadStarted"];

export type RemoteEventName =
  | (typeof TAURI_EVENT)["remoteAddUrl"]
  | (typeof TAURI_EVENT)["remoteStartDownloads"]
  | (typeof TAURI_EVENT)["remoteCancelDownloads"]
  | (typeof TAURI_EVENT)["remoteClearList"]
  | (typeof TAURI_EVENT)["remoteSetDownloadDir"];

// Mapping from event name to its payload type for strongly-typed listeners
export interface TauriEventPayloadMap {
  [TAURI_EVENT.updateMediaInfo]: MediaInfoEvent;
  [TAURI_EVENT.downloadProgress]: MediaProgressEvent;
  [TAURI_EVENT.downloadComplete]: number;
  [TAURI_EVENT.downloadError]: number;
  [TAURI_EVENT.downloadCancelled]: number;
  [TAURI_EVENT.downloadQueued]: number;
  [TAURI_EVENT.downloadStarted]: number;
  [TAURI_EVENT.ytDlpStderr]: YtDlpStderrEvent;
  [TAURI_EVENT.remoteAddUrl]: string;
  [TAURI_EVENT.remoteStartDownloads]: undefined;
  [TAURI_EVENT.remoteCancelDownloads]: undefined;
  [TAURI_EVENT.remoteClearList]: undefined;
  [TAURI_EVENT.remoteSetDownloadDir]: string;
}

// Tauri command payloads (for invoke)
export interface DownloadSettings {
  downloadMode: "video" | "audio";
  videoQuality: "best" | "high" | "medium" | "low";
  maxResolution: "2160p" | "1440p" | "1080p" | "720p" | "480p" | "no-limit";
  videoFormat: "mp4" | "mkv" | "webm" | "best";
  audioFormat: "mp3" | "m4a" | "opus" | "best";
  audioQuality: "0" | "2" | "5" | "9";
  downloadRateLimit: string; // "unlimited" | "50K" | "100K" | "500K" | "1M" | "5M" | "10M"
  maxFileSize: string; // "unlimited" | "50M" | "100M" | "500M" | "1G" | "5G"
  appendUniqueId: boolean; // Append unique ID to filenames
  uniqueIdType: "native" | "hash"; // "native" = yt-dlp's video ID, "hash" = FNV-1a hash
}

export interface DownloadMediaCommand {
  mediaIdx: number;
  mediaSourceUrl: string;
  outputLocation: string;
  subfolder?: string;
  settings: DownloadSettings;
}

export interface GetMediaInfoCommand {
  mediaIdx: number;
  mediaSourceUrl: string;
}

export interface PlaylistEntry {
  url: string;
  title?: string;
}

export interface PlaylistExpansion {
  playlistName?: string;
  uploader?: string;
  entries: PlaylistEntry[];
  collectionId?: string;
  collectionKind?: "playlist" | "channel" | "single";
  collectionName?: string;
  folderSlug?: string;
}

export interface ExpandPlaylistCommand {
  mediaSourceUrl: string;
}

export type QuitCommand = undefined;
