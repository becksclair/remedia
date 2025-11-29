import { describe, it, expect } from "vitest";
import {
  isValidUrl,
  removeItemsAtIndices,
  calculateGlobalProgress,
  hasActiveDownloads,
  clampProgress,
  formatTimestamp,
  getSelectedIndices,
  createMediaItem,
  urlExists,
  sanitizeFolderName,
  type VideoInfo,
} from "./media-helpers";

describe("isValidUrl", () => {
  it("returns true for valid HTTP URLs", () => {
    expect(isValidUrl("http://example.com")).toBe(true);
  });

  it("returns true for valid HTTPS URLs", () => {
    expect(isValidUrl("https://example.com/video")).toBe(true);
  });

  it("returns false for invalid URLs", () => {
    expect(isValidUrl("not a url")).toBe(false);
    expect(isValidUrl("ftp://example.com")).toBe(false);
    expect(isValidUrl("")).toBe(false);
  });

  it("returns false for URLs without protocol", () => {
    expect(isValidUrl("example.com")).toBe(false);
  });
});

describe("removeItemsAtIndices", () => {
  it("removes items at specified indices", () => {
    const items = ["a", "b", "c", "d"];
    const result = removeItemsAtIndices(items, new Set([1, 3]));
    expect(result).toEqual(["a", "c"]);
  });

  it("returns original array when no indices specified", () => {
    const items = ["a", "b", "c"];
    const result = removeItemsAtIndices(items, new Set());
    expect(result).toEqual(["a", "b", "c"]);
  });

  it("handles empty array", () => {
    const result = removeItemsAtIndices([], new Set([0]));
    expect(result).toEqual([]);
  });

  it("ignores out-of-bounds indices", () => {
    const items = ["a", "b"];
    const result = removeItemsAtIndices(items, new Set([5, 10]));
    expect(result).toEqual(["a", "b"]);
  });
});

describe("calculateGlobalProgress", () => {
  const createItem = (progress: number): VideoInfo => ({
    id: "test",
    url: "test",
    title: "test",
    audioOnly: false,
    progress,
    status: "Pending",
  });

  it("calculates average progress correctly", () => {
    const mediaList = [createItem(0), createItem(50), createItem(100)];
    expect(calculateGlobalProgress(mediaList)).toBe(50);
  });

  it("returns 0 for empty list", () => {
    expect(calculateGlobalProgress([])).toBe(0);
  });

  it("handles single item", () => {
    const mediaList = [createItem(75)];
    expect(calculateGlobalProgress(mediaList)).toBe(75);
  });

  it("handles all items at 0 progress", () => {
    const mediaList = [createItem(0), createItem(0)];
    expect(calculateGlobalProgress(mediaList)).toBe(0);
  });

  it("handles fractional averages", () => {
    const mediaList = [createItem(33), createItem(66)];
    expect(calculateGlobalProgress(mediaList)).toBe(49.5);
  });
});

describe("hasActiveDownloads", () => {
  const createItem = (status: VideoInfo["status"]): VideoInfo => ({
    id: "test",
    url: "test",
    title: "test",
    audioOnly: false,
    progress: 0,
    status,
  });

  it("returns true when at least one item is downloading", () => {
    const mediaList = [createItem("Pending"), createItem("Downloading"), createItem("Done")];
    expect(hasActiveDownloads(mediaList)).toBe(true);
  });

  it("returns false when no items are downloading", () => {
    const mediaList = [createItem("Pending"), createItem("Done"), createItem("Error")];
    expect(hasActiveDownloads(mediaList)).toBe(false);
  });

  it("returns false for empty list", () => {
    expect(hasActiveDownloads([])).toBe(false);
  });

  it("returns true when all items are downloading", () => {
    const mediaList = [createItem("Downloading"), createItem("Downloading")];
    expect(hasActiveDownloads(mediaList)).toBe(true);
  });
});

describe("clampProgress", () => {
  it("clamps values above 100 to 100", () => {
    expect(clampProgress(150)).toBe(100);
    expect(clampProgress(101)).toBe(100);
  });

  it("clamps negative values to 0", () => {
    expect(clampProgress(-5)).toBe(0);
    expect(clampProgress(-100)).toBe(0);
  });

  it("leaves valid values unchanged", () => {
    expect(clampProgress(0)).toBe(0);
    expect(clampProgress(50)).toBe(50);
    expect(clampProgress(100)).toBe(100);
  });

  it("handles decimal values", () => {
    expect(clampProgress(45.7)).toBe(45.7);
    expect(clampProgress(99.9)).toBe(99.9);
  });
});

describe("formatTimestamp", () => {
  it("formats timestamp to time string", () => {
    // 2024-01-01 12:30:45 UTC
    const timestamp = new Date("2024-01-01T12:30:45Z").getTime();
    const result = formatTimestamp(timestamp);

    // Result depends on timezone, so just check format
    expect(result).toMatch(/^\d{1,2}:\d{2}:\d{2}/);
  });

  it("handles different timestamps", () => {
    const now = Date.now();
    const result = formatTimestamp(now);
    expect(result).toMatch(/^\d{1,2}:\d{2}:\d{2}/);
  });
});

describe("getSelectedIndices", () => {
  it("extracts selected indices", () => {
    const rowSelection = { "0": true, "2": true, "5": true };
    const result = getSelectedIndices(rowSelection);
    expect(result).toEqual([0, 2, 5]);
  });

  it("filters out false values", () => {
    const rowSelection = { "0": true, "1": false, "2": true };
    const result = getSelectedIndices(rowSelection);
    expect(result).toEqual([0, 2]);
  });

  it("returns empty array for no selection", () => {
    const result = getSelectedIndices({});
    expect(result).toEqual([]);
  });

  it("handles all false values", () => {
    const rowSelection = { "0": false, "1": false };
    const result = getSelectedIndices(rowSelection);
    expect(result).toEqual([]);
  });
});

describe("createMediaItem", () => {
  it("creates item with default values", () => {
    const url = "https://example.com/video";
    const item = createMediaItem(url);

    expect(item).toEqual({
      id: url,
      url,
      title: url,
      audioOnly: false,
      progress: 0,
      status: "Pending",
      thumbnail: "",
      previewUrl: undefined,
    });
  });

  it("uses URL as title by default", () => {
    const item = createMediaItem("https://test.com");
    expect(item.title).toBe("https://test.com");
  });
});

describe("urlExists", () => {
  const createItem = (url: string): VideoInfo => ({
    id: url,
    url,
    title: url,
    audioOnly: false,
    progress: 0,
    status: "Pending",
  });

  it("returns true when URL exists", () => {
    const mediaList = [createItem("https://a.com"), createItem("https://b.com")];
    expect(urlExists(mediaList, "https://a.com")).toBe(true);
  });

  it("returns false when URL does not exist", () => {
    const mediaList = [createItem("https://a.com")];
    expect(urlExists(mediaList, "https://c.com")).toBe(false);
  });

  it("returns false for empty list", () => {
    expect(urlExists([], "https://a.com")).toBe(false);
  });

  it("is case-sensitive", () => {
    const mediaList = [createItem("https://Example.com")];
    expect(urlExists(mediaList, "https://example.com")).toBe(false);
  });
});

describe("sanitizeFolderName", () => {
  it("replaces invalid characters and collapses whitespace", () => {
    const result = sanitizeFolderName(" My <Weird> Playlist: Name? ");
    expect(result).toBe("My_Weird_Playlist_Name");
  });

  it("returns 'untitled' for empty or whitespace-only names", () => {
    expect(sanitizeFolderName("")).toBe("untitled");
    expect(sanitizeFolderName("   ")).toBe("untitled");
  });

  it("trims trailing dots and spaces", () => {
    const result = sanitizeFolderName("My Name.  ");
    expect(result).toBe("My_Name");
  });
});
