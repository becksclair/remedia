import { useState, useEffect, useRef } from "react";
import type { JSX } from "react";
import { useAtomValue } from "jotai";
import { logEntriesAtom } from "@/state/app-atoms";
import { useTauriEvents } from "@/hooks/useTauriEvent";
import { Button } from "./ui/button";
import { Input } from "./ui/input";

export function DebugConsole() {
	const logEntries = useAtomValue(logEntriesAtom);
	const [searchTerm, setSearchTerm] = useState("");
	const [currentMatchIndex, setCurrentMatchIndex] = useState(0);
	const [matches, setMatches] = useState<number[]>([]);
	const logContainerRef = useRef<HTMLDivElement>(null);
	const matchRefs = useRef<(HTMLSpanElement | null)[]>([]);

	// Subscribe to yt-dlp stderr events
	useTauriEvents({
		"yt-dlp-stderr": () => {
			// Events are already handled by App.tsx which adds to logEntriesAtom
			// This component just reads from the atom
			console.log("yt-dlp-stderr event received in debug console");
		}
	});

	// Update matches when search term or log entries change
	useEffect(() => {
		if (!searchTerm) {
			setMatches([]);
			setCurrentMatchIndex(0);
			return;
		}

		const searchLower = searchTerm.toLowerCase();
		const newMatches: number[] = [];

		logEntries.forEach((entry, index) => {
			if (entry.message.toLowerCase().includes(searchLower)) {
				newMatches.push(index);
			}
		});

		setMatches(newMatches);
		setCurrentMatchIndex(0);
	}, [searchTerm, logEntries]);

	// Scroll to current match
	useEffect(() => {
		if (matches.length > 0 && matchRefs.current[currentMatchIndex]) {
			matchRefs.current[currentMatchIndex]?.scrollIntoView({
				behavior: "smooth",
				block: "center"
			});
		}
	}, [currentMatchIndex, matches]);

	const handleFindNext = () => {
		if (matches.length === 0) return;

		// Cycle to next match, wrap around
		setCurrentMatchIndex((prev) => (prev + 1) % matches.length);
	};

	const formatTimestamp = (timestamp: number): string => {
		const date = new Date(timestamp);
		return date.toLocaleTimeString();
	};

	const highlightText = (text: string, entryIndex: number): JSX.Element => {
		if (!searchTerm || !matches.includes(entryIndex)) {
			return <span>{text}</span>;
		}

		const searchLower = searchTerm.toLowerCase();
		const textLower = text.toLowerCase();
		const index = textLower.indexOf(searchLower);

		if (index === -1) {
			return <span>{text}</span>;
		}

		const isCurrentMatch = matches[currentMatchIndex] === entryIndex;
		const before = text.substring(0, index);
		const match = text.substring(index, index + searchTerm.length);
		const after = text.substring(index + searchTerm.length);

		return (
			<span>
				{before}
				<span
					ref={(el) => {
						if (isCurrentMatch) {
							const matchIndex = matches.indexOf(entryIndex);
							matchRefs.current[matchIndex] = el;
						}
					}}
					className={`highlight ${isCurrentMatch ? "bg-yellow-300 font-bold" : "bg-yellow-100"}`}
				>
					{match}
				</span>
				{after}
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
					{matches.length > 0 && ` (${currentMatchIndex + 1}/${matches.length})`}
				</Button>
			</div>

			<div
				ref={logContainerRef}
				className="flex-1 overflow-y-auto border rounded p-4 bg-gray-50 dark:bg-gray-900 font-mono text-sm"
			>
				{logEntries.length === 0 ? (
					<p className="text-gray-500">No log entries yet. Start a download to see logs.</p>
				) : (
					<div className="space-y-1">
						{logEntries.map((entry, index) => (
							<div
								key={`${entry.timestamp}-${index}`}
								className={`flex gap-2 ${
									entry.level === "error"
										? "text-red-600"
										: entry.level === "warn"
											? "text-yellow-600"
											: "text-gray-700 dark:text-gray-300"
								}`}
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
