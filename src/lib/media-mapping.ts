import {
  sanitizeFolderName,
  buildCollectionId,
  type VideoInfo,
  type CollectionKind,
} from "@/utils/media-helpers";
import type { MediaInfoEvent } from "@/types";

export function mapMediaInfoEventToUpdate(payload: MediaInfoEvent): Partial<VideoInfo> {
  const [
    _mediaIdx,
    mediaSourceUrl,
    title,
    thumbnail,
    previewUrl,
    uploader,
    backendCollectionId,
    backendCollectionKind,
    backendCollectionName,
    backendFolderSlug,
  ] = payload;

  const hasUploader = Boolean(uploader && uploader.trim().length > 0);

  const collectionType: CollectionKind | undefined =
    backendCollectionKind ?? (hasUploader ? "channel" : undefined);

  const collectionName = backendCollectionName ?? (hasUploader ? uploader || undefined : undefined);

  const subfolder =
    // Prefer explicit backend folder slug/name when available
    backendFolderSlug ?? backendCollectionName ?? (hasUploader ? uploader || undefined : undefined);

  const folderSlug =
    backendFolderSlug ?? (collectionName ? sanitizeFolderName(collectionName) : undefined);

  const collectionId =
    backendCollectionId ??
    (collectionType && (collectionName || mediaSourceUrl)
      ? buildCollectionId(collectionType, { name: collectionName, url: mediaSourceUrl })
      : undefined);

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
