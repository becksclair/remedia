import { describe, it, expect } from "bun:test";
import {
  findLogMatches,
  getNextMatchIndex,
  splitTextForHighlight,
  getLogLevelClass,
  type LogEntry,
} from "./log-helpers";

// Helper to create mock log entries
function createLogEntry(
  message: string,
  level: "info" | "warn" | "error" = "info",
  mediaIdx?: number,
): LogEntry {
  return {
    timestamp: Date.now(),
    source: "test",
    level,
    message,
    mediaIdx,
  };
}

describe("findLogMatches", () => {
  it("returns empty array for empty search term", () => {
    const logs = [createLogEntry("test message"), createLogEntry("another message")];
    expect(findLogMatches(logs, "")).toEqual([]);
  });

  it("returns empty array for empty log list", () => {
    expect(findLogMatches([], "test")).toEqual([]);
  });

  it("finds single match", () => {
    const logs = [
      createLogEntry("test message"),
      createLogEntry("another message"),
      createLogEntry("final message"),
    ];
    const matches = findLogMatches(logs, "test");
    expect(matches).toEqual([0]);
  });

  it("finds multiple matches", () => {
    const logs = [
      createLogEntry("error occurred"),
      createLogEntry("normal message"),
      createLogEntry("another error"),
      createLogEntry("warning message"),
    ];
    const matches = findLogMatches(logs, "error");
    expect(matches).toEqual([0, 2]);
  });

  it("performs case-insensitive search", () => {
    const logs = [
      createLogEntry("ERROR Message"),
      createLogEntry("Error detected"),
      createLogEntry("no match"),
    ];
    const matches = findLogMatches(logs, "error");
    expect(matches).toEqual([0, 1]);
  });

  it("finds partial matches", () => {
    const logs = [
      createLogEntry("downloading file.mp4"),
      createLogEntry("download complete"),
      createLogEntry("upload started"),
    ];
    const matches = findLogMatches(logs, "load");
    expect(matches).toEqual([0, 1, 2]); // matches "down[load]ing", "down[load]", "up[load]"
  });

  it("returns all indices when search term matches all entries", () => {
    const logs = [createLogEntry("test 1"), createLogEntry("test 2"), createLogEntry("test 3")];
    const matches = findLogMatches(logs, "test");
    expect(matches).toEqual([0, 1, 2]);
  });

  it("handles special regex characters safely", () => {
    const logs = [createLogEntry("[error] test"), createLogEntry("normal message")];
    const matches = findLogMatches(logs, "[error]");
    expect(matches).toEqual([0]);
  });
});

describe("getNextMatchIndex", () => {
  it("returns 0 when no matches", () => {
    expect(getNextMatchIndex(0, 0)).toBe(0);
  });

  it("increments index for next match", () => {
    expect(getNextMatchIndex(0, 3)).toBe(1);
    expect(getNextMatchIndex(1, 3)).toBe(2);
  });

  it("wraps around to 0 at end", () => {
    expect(getNextMatchIndex(2, 3)).toBe(0);
  });

  it("handles single match by staying at 0", () => {
    expect(getNextMatchIndex(0, 1)).toBe(0);
  });

  it("wraps from any position", () => {
    expect(getNextMatchIndex(4, 5)).toBe(0);
    expect(getNextMatchIndex(9, 10)).toBe(0);
  });
});

describe("splitTextForHighlight", () => {
  it("returns null for empty search term", () => {
    expect(splitTextForHighlight("test message", "")).toBeNull();
  });

  it("returns null when search term not found", () => {
    expect(splitTextForHighlight("test message", "xyz")).toBeNull();
  });

  it("splits text with match at beginning", () => {
    const result = splitTextForHighlight("error in file", "error");
    expect(result).toEqual({
      before: "",
      match: "error",
      after: " in file",
    });
  });

  it("splits text with match in middle", () => {
    const result = splitTextForHighlight("download error occurred", "error");
    expect(result).toEqual({
      before: "download ",
      match: "error",
      after: " occurred",
    });
  });

  it("splits text with match at end", () => {
    const result = splitTextForHighlight("this is an error", "error");
    expect(result).toEqual({
      before: "this is an ",
      match: "error",
      after: "",
    });
  });

  it("performs case-insensitive matching", () => {
    const result = splitTextForHighlight("Download ERROR", "error");
    expect(result).toEqual({
      before: "Download ",
      match: "ERROR",
      after: "",
    });
  });

  it("preserves original case in match", () => {
    const result = splitTextForHighlight("Test Message", "mess");
    expect(result).toEqual({
      before: "Test ",
      match: "Mess",
      after: "age",
    });
  });

  it("finds first occurrence when multiple matches exist", () => {
    const result = splitTextForHighlight("error after error", "error");
    expect(result).toEqual({
      before: "",
      match: "error",
      after: " after error",
    });
  });

  it("handles single character search", () => {
    const result = splitTextForHighlight("test", "e");
    expect(result).toEqual({
      before: "t",
      match: "e",
      after: "st",
    });
  });
});

describe("getLogLevelClass", () => {
  it("returns red for error level", () => {
    expect(getLogLevelClass("error")).toBe("text-red-600");
  });

  it("returns yellow for warn level", () => {
    expect(getLogLevelClass("warn")).toBe("text-yellow-600");
  });

  it("returns gray for info level", () => {
    expect(getLogLevelClass("info")).toBe("text-gray-700 dark:text-gray-300");
  });
});
