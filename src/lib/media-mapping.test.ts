import { describe, it, expect } from "bun:test";
import type { MediaInfoEvent } from "@/types";
import { mapMediaInfoEventToUpdate } from "./media-mapping";

describe("mapMediaInfoEventToUpdate", () => {
  it("does NOT set collection metadata for single videos even with uploader", () => {
    const payload: MediaInfoEvent = [
      0,
      "https://example.com/video",
      "Some Title",
      "thumb.jpg",
      "https://example.com/preview",
      "Some Channel",
      null,
      null,
      null,
      null,
    ];

    const update = mapMediaInfoEventToUpdate(payload);

    expect(update.url).toBe("https://example.com/video");
    expect(update.title).toBe("Some Title");
    expect(update.thumbnail).toBe("thumb.jpg");
    expect(update.previewUrl).toBe("https://example.com/preview");
    // Single videos should NOT have collection metadata
    expect(update.subfolder).toBeUndefined();
    expect(update.collectionType).toBeUndefined();
    expect(update.collectionName).toBeUndefined();
    expect(update.folderSlug).toBeUndefined();
    expect(update.collectionId).toBeUndefined();
  });

  it("sets collection metadata for playlist videos", () => {
    const payload: MediaInfoEvent = [
      0,
      "https://example.com/video",
      "Some Title",
      "thumb.jpg",
      "https://example.com/preview",
      "Some Channel",
      "playlist:My Playlist",
      "playlist",
      "My Playlist",
      "My_Playlist",
    ];

    const update = mapMediaInfoEventToUpdate(payload);

    expect(update.url).toBe("https://example.com/video");
    expect(update.title).toBe("Some Title");
    expect(update.thumbnail).toBe("thumb.jpg");
    expect(update.previewUrl).toBe("https://example.com/preview");
    // Playlist videos should have collection metadata
    expect(update.subfolder).toBe("My_Playlist");
    expect(update.collectionType).toBe("playlist");
    expect(update.collectionName).toBe("My Playlist");
    expect(update.folderSlug).toBe("My_Playlist");
    expect(update.collectionId).toBe("playlist:My Playlist");
  });

  it("sets collection metadata for channel videos", () => {
    const payload: MediaInfoEvent = [
      0,
      "https://example.com/video",
      "Some Title",
      "thumb.jpg",
      "https://example.com/preview",
      "Some Channel",
      "channel:Some Channel",
      "channel",
      "Some Channel",
      "Some_Channel",
    ];

    const update = mapMediaInfoEventToUpdate(payload);

    expect(update.url).toBe("https://example.com/video");
    expect(update.title).toBe("Some Title");
    expect(update.thumbnail).toBe("thumb.jpg");
    expect(update.previewUrl).toBe("https://example.com/preview");
    // Channel videos should have collection metadata
    expect(update.subfolder).toBe("Some_Channel");
    expect(update.collectionType).toBe("channel");
    expect(update.collectionName).toBe("Some Channel");
    expect(update.folderSlug).toBe("Some_Channel");
    expect(update.collectionId).toBe("channel:Some Channel");
  });

  it("does not set collection metadata when uploader is missing", () => {
    const payload: MediaInfoEvent = [
      0,
      "https://example.com/video",
      "Some Title",
      "thumb.jpg",
      "https://example.com/preview",
      null,
      null,
      null,
      null,
      null,
    ];

    const update = mapMediaInfoEventToUpdate(payload);

    expect(update.collectionType).toBeUndefined();
    expect(update.collectionName).toBeUndefined();
    expect(update.subfolder).toBeUndefined();
    expect(update.folderSlug).toBeUndefined();
  });
});
