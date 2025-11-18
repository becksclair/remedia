import { atom } from "jotai";

type RowSelectionState = Record<string, boolean>;

export const tableRowSelectionAtom = atom<RowSelectionState>({});

// Log management for Debug Console (Phase 0.2)
export type LogEntry = {
	timestamp: number;
	source: "yt-dlp" | "app";
	level: "info" | "warn" | "error";
	message: string;
	mediaIdx?: number;
};

// Store last 1000 log entries
const MAX_LOG_ENTRIES = 1000;

export const logEntriesAtom = atom<LogEntry[]>([]);

// Helper atom to add a log entry
export const addLogEntryAtom = atom(null, (get, set, entry: LogEntry) => {
	const currentLogs = get(logEntriesAtom);
	const newLogs = [...currentLogs, entry];
	// Keep only the last MAX_LOG_ENTRIES
	if (newLogs.length > MAX_LOG_ENTRIES) {
		set(logEntriesAtom, newLogs.slice(-MAX_LOG_ENTRIES));
	} else {
		set(logEntriesAtom, newLogs);
	}
});
