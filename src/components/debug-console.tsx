import { useState, useEffect, useRef, useCallback } from "react";
import type { JSX } from "react";
import { useAtomValue, useSetAtom } from "jotai";
import { logEntriesAtom, addLogEntryAtom } from "@/state/app-atoms";
import { useTauriEvents } from "@/hooks/useTauriEvent";
import type { Event } from "@tauri-apps/api/event";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { formatTimestamp } from "@/utils/media-helpers";
import {
  findLogMatches,
  getNextMatchIndex,
  splitTextForHighlight,
  getLogLevelClass,
} from "@/utils/log-helpers";

export function DebugConsole() {
  const logEntries = useAtomValue(logEntriesAtom);
  const addLogEntry = useSetAtom(addLogEntryAtom);

  // Handle yt-dlp-stderr events to populate logs
  const handleYtDlpStderr = useCallback(
    (event: Event<[number, string]>): void => {
      const [mediaIdx, message] = event.payload;

      // Normalize case for log-level detection
      const messageLower = message.toLowerCase();

      // Determine log level
      let level: "error" | "warn" | "info" = "info";
      if (
        message.startsWith("ERROR") ||
        message.startsWith("Error") ||
        message.startsWith("error")
      ) {
        level = "error";
      } else if (
        message.startsWith("WARNING") ||
        message.startsWith("Warning") ||
        message.startsWith("WARN") ||
        message.startsWith("Warn") ||
        message.startsWith("warn")
      ) {
        level = "warn";
      } else if (/\b(error|err)\b/i.test(messageLower)) {
        level = "error";
      } else if (/\b(warn|warning)\b/i.test(messageLower)) {
        level = "warn";
      }

      addLogEntry({
        timestamp: Date.now(),
        source: "yt-dlp",
        level,
        message,
        mediaIdx,
      });
    },
    [addLogEntry],
  );

  // Subscribe to Tauri events for logs
  useTauriEvents({
    "yt-dlp-stderr": handleYtDlpStderr,
  });
  const [searchTerm, setSearchTerm] = useState("");
  const [currentMatchIndex, setCurrentMatchIndex] = useState(-1);
  const [matches, setMatches] = useState<number[]>([]);
  const logContainerRef = useRef<HTMLDivElement>(null);
  const matchRefs = useRef<(HTMLSpanElement | null)[]>([]);

  // Update matches when search term or log entries change
  useEffect(() => {
    const newMatches = findLogMatches(logEntries, searchTerm);
    setMatches(newMatches);
    setCurrentMatchIndex(-1);
  }, [searchTerm, logEntries]);

  // Scroll to current match
  useEffect(() => {
    if (matches.length > 0 && matchRefs.current[currentMatchIndex]) {
      matchRefs.current[currentMatchIndex]?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    }
  }, [currentMatchIndex, matches]);

  const handleFindNext = () => {
    if (matches.length === 0) return;
    setCurrentMatchIndex((prev) => (prev === -1 ? 0 : getNextMatchIndex(prev, matches.length)));
  };

  const highlightText = (text: string, entryIndex: number): JSX.Element => {
    if (!searchTerm || !matches.includes(entryIndex)) {
      return <span>{text}</span>;
    }

    const split = splitTextForHighlight(text, searchTerm);

    if (!split) {
      return <span>{text}</span>;
    }

    const isCurrentMatch =
      currentMatchIndex >= 0 &&
      matches[currentMatchIndex] !== undefined &&
      matches[currentMatchIndex] === entryIndex;

    return (
      <span>
        {split.before}
        <span
          ref={(el) => {
            if (isCurrentMatch) {
              const matchIndex = matches.indexOf(entryIndex);
              matchRefs.current[matchIndex] = el;
            }
          }}
          data-current-match={isCurrentMatch ? "true" : undefined}
          className={`highlight ${isCurrentMatch ? "bg-yellow-300 font-bold" : "bg-yellow-100"}`}
        >
          {split.match}
        </span>
        {split.after}
      </span>
    );
  };

  return (
    <div className="flex flex-col h-screen p-4 gap-4">
      <div className="flex gap-2">
        <Input
          type="text"
          placeholder="Search logs..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="flex-1"
        />
        <Button onClick={handleFindNext} disabled={matches.length === 0}>
          Find Next
          {matches.length > 0 &&
            currentMatchIndex >= 0 &&
            ` (${currentMatchIndex + 1}/${matches.length})`}
        </Button>
      </div>

      <div
        ref={logContainerRef}
        role="log"
        aria-live="polite"
        aria-relevant="additions"
        aria-label="Download log output"
        className="flex-1 overflow-y-auto border rounded p-4 bg-gray-50 dark:bg-gray-900 font-mono text-sm"
      >
        {logEntries.length === 0 ? (
          <p className="text-gray-500">No log entries yet. Start a download to see logs.</p>
        ) : (
          <div className="space-y-1">
            {logEntries.map((entry, index) => (
              <div
                key={`${entry.timestamp}-${index}`}
                className={`flex gap-2 ${getLogLevelClass(entry.level)}`}
              >
                <span className="text-gray-500 shrink-0">{formatTimestamp(entry.timestamp)}</span>
                <span className="text-blue-600 shrink-0">[{entry.source}]</span>
                {entry.mediaIdx !== undefined && (
                  <span className="text-purple-600 shrink-0">[media-{entry.mediaIdx}]</span>
                )}
                <span className="break-all">{highlightText(entry.message, index)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
