import { describe, it, expect } from "bun:test";
import type { MediaInfoEvent } from "@/types";
import { sanitizeFolderName, buildCollectionId } from "@/utils/media-helpers";
import { mapMediaInfoEventToUpdate } from "./media-mapping";

describe("mapMediaInfoEventToUpdate", () => {
  it("maps single-video media info with uploader to channel collection metadata and folderSlug", () => {
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
    expect(update.subfolder).toBe("Some Channel");
    expect(update.collectionType).toBe("channel");
    expect(update.collectionName).toBe("Some Channel");
    expect(update.folderSlug).toBe(sanitizeFolderName("Some Channel"));
    expect(update.collectionId).toBe(
      buildCollectionId("channel", { name: "Some Channel", url: "https://example.com/video" }),
    );
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
