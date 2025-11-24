/**
 * Pure utility functions for log search and filtering
 */

export interface LogEntry {
  timestamp: number;
  source: string;
  level: "info" | "warn" | "error";
  message: string;
  mediaIdx?: number;
}

/**
 * Finds indices of log entries that match the search term
 * @param logEntries - Array of log entries to search
 * @param searchTerm - Case-insensitive search term
 * @returns Array of indices that match
 */
export function findLogMatches(
  logEntries: LogEntry[],
  searchTerm: string,
): number[] {
  if (!searchTerm) {
    return [];
  }

  const searchLower = searchTerm.toLowerCase();
  const matches: number[] = [];

  logEntries.forEach((entry, index) => {
    if (entry.message.toLowerCase().includes(searchLower)) {
      matches.push(index);
    }
  });

  return matches;
}

/**
 * Calculates the next match index with wraparound
 * @param currentIndex - Current match index
 * @param totalMatches - Total number of matches
 * @returns Next match index (wraps to 0 after last)
 */
export function getNextMatchIndex(
  currentIndex: number,
  totalMatches: number,
): number {
  if (totalMatches === 0) {
    return 0;
  }
  return (currentIndex + 1) % totalMatches;
}

/**
 * Splits text into parts for highlighting a search term
 * @param text - Text to split
 * @param searchTerm - Term to find and highlight
 * @returns Object with before, match, after strings, or null if no match
 */
export function splitTextForHighlight(
  text: string,
  searchTerm: string,
): { before: string; match: string; after: string } | null {
  if (!searchTerm) {
    return null;
  }

  const searchLower = searchTerm.toLowerCase();
  const textLower = text.toLowerCase();
  const index = textLower.indexOf(searchLower);

  if (index === -1) {
    return null;
  }

  return {
    before: text.substring(0, index),
    match: text.substring(index, index + searchTerm.length),
    after: text.substring(index + searchTerm.length),
  };
}

/**
 * Gets the CSS class name for a log level
 * @param level - Log level (info, warn, error)
 * @returns Tailwind CSS class string
 */
export function getLogLevelClass(level: "info" | "warn" | "error"): string {
  switch (level) {
    case "error":
      return "text-red-600";
    case "warn":
      return "text-yellow-600";
    case "info":
    default:
      return "text-gray-700 dark:text-gray-300";
  }
}
