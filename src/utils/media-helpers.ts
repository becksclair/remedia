/**
 * Pure utility functions for media list management
 */

export type CollectionKind = "playlist" | "channel" | "single";

export interface CollectionMetadata {
  collectionType?: CollectionKind;
  collectionName?: string;
  folderSlug?: string;
  collectionId?: string;
}

export interface VideoInfo extends CollectionMetadata {
  id: string;
  url: string;
  title: string;
  thumbnail?: string;
  previewUrl?: string;
  subfolder?: string; // Playlist name or channel name for folder organization
  audioOnly: boolean;
  progress: number;
  status: "Pending" | "Downloading" | "Done" | "Error" | "Cancelled";
}

/**
 * Validates if a string is a valid URL
 * @param input - String to validate
 * @returns true if valid URL, false otherwise
 */
export function isValidUrl(input: string): boolean {
  return /^https?:\/\/.+/.test(input);
}

/**
 * Removes items from media list at specified indices
 * @param mediaList - Current media list
 * @param indicesToRemove - Set of indices to remove
 * @returns New array with items removed
 */
export function removeItemsAtIndices<T>(items: T[], indicesToRemove: Set<number>): T[] {
  return items.filter((_, index) => !indicesToRemove.has(index));
}

/**
 * Calculates global progress as average of all items
 * @param mediaList - Array of media items with progress
 * @returns Average progress (0-100) or 0 if empty
 */
export function calculateGlobalProgress(mediaList: VideoInfo[]): number {
  if (mediaList.length === 0) return 0;

  const totalProgress = mediaList.reduce((sum, item) => sum + item.progress, 0);
  return totalProgress / mediaList.length;
}

/**
 * Checks if any download is currently in progress
 * @param mediaList - Array of media items
 * @returns true if at least one item is downloading
 */
export function hasActiveDownloads(mediaList: VideoInfo[]): boolean {
  return mediaList.some((media) => media.status === "Downloading");
}

/**
 * Clamps progress value to valid range (0-100)
 * @param progress - Raw progress value
 * @returns Clamped value between 0 and 100
 */
export function clampProgress(progress: number): number {
  return Math.min(100, Math.max(0, progress));
}

/**
 * Formats timestamp to readable time string
 * @param timestamp - Unix timestamp in milliseconds
 * @returns Formatted time string (HH:MM:SS)
 */
export function formatTimestamp(timestamp: number): string {
  const date = new Date(timestamp);
  return date.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

/**
 * Extracts indices from row selection object
 * @param rowSelection - Object with row indices as keys
 * @returns Array of selected indices
 */
export function getSelectedIndices(rowSelection: Record<string, boolean>): number[] {
  return Object.keys(rowSelection)
    .filter((key) => rowSelection[key] === true)
    .map((idx) => Number.parseInt(idx, 10));
}

/**
 * Creates a new media item from a URL
 * @param url - Media source URL
 * @returns New VideoInfo object with default values
 */
export function createMediaItem(url: string): VideoInfo {
  return {
    id: url,
    audioOnly: false,
    progress: 0,
    status: "Pending",
    title: url,
    url: url,
    thumbnail: "",
    previewUrl: undefined,
  };
}

/**
 * Checks if URL already exists in media list
 * @param mediaList - Current media list
 * @param url - URL to check
 * @returns true if URL exists, false otherwise
 */
export function urlExists(mediaList: VideoInfo[], url: string): boolean {
  return mediaList.some((media) => media.url === url);
}

export function sanitizeFolderName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return "untitled";

  // Replace characters that are typically invalid in file/folder names
  let result = trimmed.replace(/[<>:"/\\|?*]/g, "_");

  // Collapse runs of whitespace and underscores into a single underscore
  result = result.replace(/[\s_]+/g, "_");

  // Remove trailing dots and spaces which are problematic on Windows
  result = result.replace(/[. ]+$/g, "");

  // Trim leading/trailing underscores
  result = result.replace(/^_+|_+$/g, "");

  if (!result) return "untitled";
  return result;
}

export function buildCollectionId(
  kind: CollectionKind,
  {
    name,
    url,
  }: {
    name?: string | null;
    url?: string;
  },
): string {
  const baseName = name?.trim();
  const key = baseName && baseName.length > 0 ? baseName : (url ?? "unknown");
  return `${kind}:${key}`;
}
