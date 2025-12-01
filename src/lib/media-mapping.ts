import { sanitizeFolderName, type VideoInfo, type CollectionKind } from "@/utils/media-helpers";
import type { MediaInfoEvent } from "@/types";

export function mapMediaInfoEventToUpdate(payload: MediaInfoEvent): Partial<VideoInfo> {
  const [
    _mediaIdx,
    mediaSourceUrl,
    title,
    thumbnail,
    previewUrl,
    _uploader,
    backendCollectionId,
    backendCollectionKind,
    backendCollectionName,
    backendFolderSlug,
  ] = payload;

  const collectionType: CollectionKind | undefined = backendCollectionKind ?? undefined;

  const collectionName = backendCollectionName ?? undefined;

  const subfolder =
    // Only set subfolder for actual playlists/channels, not single videos
    // Backend explicitly sets collection info to None for single videos
    backendCollectionKind === "playlist" || backendCollectionKind === "channel"
      ? (backendFolderSlug ?? backendCollectionName ?? undefined)
      : undefined;

  const folderSlug =
    backendCollectionKind === "playlist" || backendCollectionKind === "channel"
      ? (backendFolderSlug ?? (collectionName ? sanitizeFolderName(collectionName) : undefined))
      : undefined;

  const collectionId = backendCollectionId ?? undefined;

  return {
    thumbnail,
    title,
    url: mediaSourceUrl,
    previewUrl: previewUrl || undefined,
    subfolder,
    collectionType,
    collectionName,
    folderSlug,
    collectionId,
  };
}
