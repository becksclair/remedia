import { invoke } from "@tauri-apps/api/core";
import type { Event } from "@tauri-apps/api/event";
import { downloadDir } from "@tauri-apps/api/path";
import { readText } from "@tauri-apps/plugin-clipboard-manager";
import { isPermissionGranted, requestPermission, sendNotification } from "@tauri-apps/plugin-notification";

import { useEffect, useState } from "react";
import type { JSX } from "react";
import { DropZone } from "./components/drop-zone.tsx";
import { Button } from "./components/ui/button.tsx";
import { Progress } from "./components/ui/progress.tsx";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";

import type { ColumnDef } from "@tanstack/react-table";
import { MoreHorizontal } from "lucide-react";

import { useWindowFocus } from "@/hooks/use-window-focus";
import { useTauriEvents } from "@/hooks/useTauriEvent";
import type { MediaInfoEvent, MediaProgressEvent } from "@/types";

import { DataTable } from "./components/data-table.tsx";
import { Checkbox } from "./components/ui/checkbox.tsx";

import { SettingsDialog } from "./components/settings-dialog";

import "./App.css";

import { useAtom } from "jotai";
import { downloadLocationAtom } from "@/state/settings-atoms";
import { tableRowSelectionAtom } from "@/state/app-atoms";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";

declare global {
	interface Window {
		__E2E_addUrl?: (url: string) => void;
	}
}

type VideoInfo = {
	url: string;
	title: string;
	thumbnail?: string;
	audioOnly: boolean;
	progress: number;
	status: "Pending" | "Downloading" | "Done" | "Error";
};

function debounce(callback: () => void, delay: number): () => void {
	let timer: ReturnType<typeof setTimeout> | undefined;
	return () => {
		if (timer !== undefined) clearTimeout(timer);
		timer = setTimeout(callback, delay);
	};
}

function App(): JSX.Element {
	const [notificationPermission, setNotificationPermission] = useState(false);
	const [dragHovering, setDragHovering] = useState(false);
	const [mediaList, setMediaList] = useState<VideoInfo[]>([]);
	const [outputLocation, setOutputLocation] = useAtom(downloadLocationAtom);
	const [rowSelection] = useAtom(tableRowSelectionAtom);
	const [globalProgress, setGlobalProgress] = useState(0);
	const [globalDownloading, setGlobalDownloading] = useState(false);
	const [settingsOpen, setSettingsOpen] = useState(false);

	const MediaListColumns: ColumnDef<VideoInfo>[] = [
		{
			cell: ({ row }) => (
				<Checkbox
					checked={row.getIsSelected()}
					onCheckedChange={value => row.toggleSelected(!!value)}
					aria-label="Select row"
				/>
			),
			enableHiding: false,
			enableSorting: false,
			header: ({ table }) => (
				<Checkbox
					checked={table.getIsAllPageRowsSelected() || (table.getIsSomePageRowsSelected() && "indeterminate")}
					onCheckedChange={value => table.toggleAllPageRowsSelected(!!value)}
					aria-label="Select all"
				/>
			),
			id: "select"
		},
		{
			accessorKey: "thumbnail",
			cell: ({ row }) => {
				const thumbnail = row.getValue("thumbnail");
				if (!thumbnail) return <div className="h-[72px] w-auto" />;

				return <img className="h-[72px] w-auto" alt="Media thumbnail" src={thumbnail as string} />;
			},
			header: () => <div className="text-left">Preview</div>
		},
		{
			accessorKey: "title",
			header: () => <div className="text-left">Title</div>,
			cell: ({ row }) => (
				<div className="text-left w-full whitespace-pre-line break-words overflow-hidden text-ellipsis">
					{row.getValue("title")}
				</div>
			)
		},
		{
			accessorKey: "audioOnly",
			cell: ({ row }) => {
				return (
					<Checkbox
						checked={row.getValue("audioOnly")}
						aria-label="Audio only"
						// Optionally, add onCheckedChange if you want to allow toggling
						// onCheckedChange={(value) => ...}
					/>
				);
			},
			header: () => <div className="text-center">Audio</div>
		},
		{
			accessorKey: "progress",
			cell: ({ row }) => {
				return <Progress value={row.getValue("progress")} />;
			},
			header: () => <div className="text-center">Progress</div>
		},
		{
			accessorKey: "status",
			header: () => <div className="text-right">Status</div>
		},
		{
			cell: ({ row }) => {
				return (
					<DropdownMenu>
						<DropdownMenuTrigger asChild>
							<Button variant="ghost" className="h-8 w-8 p-0">
								<span className="sr-only">Open menu</span>
								<MoreHorizontal className="h-4 w-4" />
							</Button>
						</DropdownMenuTrigger>
						<DropdownMenuContent align="end">
							<DropdownMenuLabel>Actions</DropdownMenuLabel>
							<DropdownMenuItem onClick={() => navigator.clipboard.writeText(row.getValue("url"))}>
								Copy URL
							</DropdownMenuItem>
							<DropdownMenuItem
								onClick={() => {
									// Remove the row from the mediaList
									setMediaList(prevList =>
										prevList.filter(item => item.title !== row.getValue("title"))
									);
								}}>
								Delete
							</DropdownMenuItem>
						</DropdownMenuContent>
					</DropdownMenu>
				);
			},
			id: "actions"
		}
	];

	const handleDragOver = (event: React.DragEvent<HTMLDivElement>): void => {
		event.preventDefault();
		setDragHovering(true);
	};

	const handleDragLeave = (event: React.DragEvent<HTMLDivElement>): void => {
		event.preventDefault();
		debounce(() => setDragHovering(false), 300)();
	};

	isPermissionGranted().then(granted => {
		if (!granted) {
			requestPermission().then(permission => {
				setNotificationPermission(permission === "granted");
			});
		}
	});

	async function startDownload(): Promise<void> {
		setGlobalProgress(0);
		setGlobalDownloading(true);

		try {
			await Promise.all(
				mediaList.map((media, i) =>
					invoke("download_media", {
						mediaIdx: i,
						mediaSourceUrl: media.url,
						outputLocation: outputLocation
					})
				)
			);
		} catch (err) {
			console.error("Error starting download:", err);
			alert("Error starting download");
			setGlobalDownloading(false);
		}
	}

	async function preview(): Promise<void> {
		const selectedRowIndices = Object.keys(rowSelection).filter(key => rowSelection[key] === true);

		if (selectedRowIndices.length === 0) {
			alert("Please select one or more items to preview");
			return;
		}

		console.log("Selected rows for preview:", selectedRowIndices);

		try {
			for (const rowIndex of selectedRowIndices) {
				const selectedItem = mediaList[Number.parseInt(rowIndex)];
				if (selectedItem?.url) {
					console.log(`Opening preview for item ${rowIndex}:`, selectedItem);

					const win = new WebviewWindow("preview-win", {
						url: `/player?url=${encodeURIComponent(selectedItem.url)}`,
						width: 760,
						height: 560,
						title: selectedItem.title ? `Preview: ${selectedItem.title}` : "ReMedia Preview"
					});

					win.once("tauri://created", () => {
						// webview successfully created
					});
					win.once("tauri://error", error => {
						console.error("Error creating webview:", error);
						// an error happened creating the webview
					});

					// NOTE rc(08/2025): Disable creating the window in the Rust side for now
					// so far, unable to get the window loading without crashing.

					// await invoke("open_preview_window", {
					// 	// Ensure leading slash so pathname === "/player" in src/main.tsx
					// 	url: `/player?url=${encodeURIComponent(selectedItem.url)}`,
					// 	title: selectedItem.title ? `Preview: ${selectedItem.title}` : "ReMedia Preview"
					// })
				} else {
					console.warn(`No URL found for selected item at index ${rowIndex}`);
				}
			}

			if (notificationPermission) {
				sendNotification({
					body: `Loading ${selectedRowIndices.length} media preview(s)...`,
					title: "Remedia"
				});
			}
		} catch (error) {
			console.error("Error opening preview window:", error);
			alert(`Failed to open preview: ${error}`);
		}
	}

	async function showSettings(): Promise<void> {
		setSettingsOpen(true);
	}

	async function quit(): Promise<void> {
		await invoke("quit");
	}

	const isUrl = (input: string): boolean => /^https?:\/\//.test(input);

	function addMediaUrl(url: string): void {
		// Check if the URL is already in the list and return if it is
		if (mediaList.some(media => media.url === url)) {
			console.log("URL already exists in the list");
			return;
		}

		const newMedia = {
			audioOnly: false,
			progress: 0,
			status: "Pending",
			title: url,
			url: url,
			thumbnail: ""
		} as VideoInfo;

		const updatedMediaList = [...mediaList, newMedia];
		const mediaIdx = updatedMediaList.findIndex(m => m.url === url);

		setMediaList(updatedMediaList);

		// Request media information
		void invoke("get_media_info", {
			mediaIdx,
			mediaSourceUrl: url
		});
	}

	// Expose test helper to add URLs without drag and drop
	if (typeof window !== "undefined" && (process.env.NODE_ENV === "test" || process.env.NODE_ENV === "development")) {
		window.__E2E_addUrl = (url: string) => {
			if (/^https?:\/\/[^\s]{3,2000}$/.test(url)) addMediaUrl(url);
		};
	}

	function clipboardIsUrl(): void {
		// Check if the clipboard content is a URL
		readText()
			.then(text => {
				if (isUrl(text)) {
					addMediaUrl(text);
					console.log("URL added from clipboard");
				}
			})
			.catch(err => {
				console.log("Error reading clipboard:", err);
			});
	}

	const updateMediaItem = (updates: Partial<VideoInfo>): void => {
		if (!updates.url) return;

		setMediaList(prevList => {
			// Remove any items where title equals updates.url
			const filtered = prevList.filter(item => item.title !== updates.url);

			const newMedia = {
				audioOnly: false,
				progress: 0,
				status: "Pending",
				title: updates.title ?? updates.url,
				url: updates.url,
				thumbnail: updates.thumbnail
			} as VideoInfo;

			// If filtered contains an item with the same title as updates.title, merge it
			const idx = filtered.findIndex(item => item.title === updates.title);

			if (idx !== -1) {
				const existing = filtered[idx];
				if (existing) {
					const merged: VideoInfo = {
						...existing,
						...updates,
						url: existing.url,
						title: updates.title ?? existing.title
					};
					filtered[idx] = merged;
				}
			} else {
				filtered.push(newMedia);
			}

			return [...filtered];
		});
	};

	// Index-based updater for progress + status events coming from Rust.
	const updateMediaItemByIndex = (index: number, updates: Partial<VideoInfo>): void => {
		setMediaList(prev => {
			if (index < 0 || index >= prev.length) return prev;
			const next = [...prev];
			const existing = next[index];
			if (!existing) return prev;
			next[index] = {
				...existing,
				...updates,
				// Preserve original identifying fields if not explicitly changed
				title: updates.title ?? existing.title,
				url: existing.url
			};
			return next;
		});
	};

	function dropHandler(input: string): void {
		setDragHovering(false);

		if (isUrl(input)) {
			addMediaUrl(input);
		}
	}

	function handleWindowFocus(): void {
		clipboardIsUrl();
	}

	const handleMediaInfo = ({
		payload: [_mediaIdx, mediaSourceUrl, title, thumbnail]
	}: Event<MediaInfoEvent>): void => {
		updateMediaItem({ thumbnail, title, url: mediaSourceUrl });
	};

	const handleProgress = (event: Event<MediaProgressEvent>): void => {
		const [mediaIdx, progress] = event.payload as MediaProgressEvent;
		// Clamp progress 0-100, set status to Downloading
		updateMediaItemByIndex(mediaIdx, { progress: Math.min(100, Math.max(0, progress)), status: "Downloading" });
	};

	const handleComplete = (event: Event<number>): void => {
		const mediaIdx = event.payload;
		updateMediaItemByIndex(mediaIdx, { progress: 100, status: "Done" });
	};
	const handleError = (event: Event<number>): void => {
		const mediaIdx = event.payload;
		updateMediaItemByIndex(mediaIdx, { status: "Error" });
	};

	useWindowFocus(handleWindowFocus);

	useEffect(() => {
		isPermissionGranted().then(granted => {
			if (!granted) {
				console.log("Requesting notification permission");
				requestPermission().then(permission => {
					console.log("Notification permission:", permission);
					setNotificationPermission(permission === "granted");
				});
			}
			console.log("Notification permission already granted:", granted);
			setNotificationPermission(granted);
		});
	}, []);

	useEffect(() => {
		// Set the default download directory to the user's download folder
		downloadDir()
			.then(dir => setOutputLocation(dir))
			.catch(error => {
				console.error("Failed to get download directory:", error);
			});
	}, [setOutputLocation]);

	// You could alternatively use the new useTauriEvents hook, uncomment this to try it:
	useTauriEvents({
		"update-media-info": handleMediaInfo,
		"download-progress": handleProgress,
		"download-complete": handleComplete,
		"download-error": handleError
	});

	// Handle dynamic updating of global download status and progress
	useEffect(() => {
		setGlobalDownloading(mediaList.some(media => media.status === "Downloading"));
		setGlobalProgress(
			globalDownloading ? mediaList.reduce((acc, item) => acc + item.progress, 0) / mediaList.length : 0
		);
	}, [mediaList, globalDownloading]);

	return (
		<main className="container" onDragOver={handleDragOver} onDragLeave={handleDragLeave}>
			{/* <CustomTitleBar /> */}

			<div className="app-container compact flex flex-col justify-between gap-y-4 h-screen ">
				<DropZone
					className="flex-auto grow overflow-y-auto"
					dropHandler={dropHandler}
					dragHovering={dragHovering}
				/>
				{/* Drop Zone + Data View */}
				<DataTable className="flex-auto grow overflow-y-auto" columns={MediaListColumns} data={mediaList} />

				<section className="flex-none flex flex-col gap-y-4">
					<div className="my-3">
						<Progress data-testid="global-progress" value={globalProgress} max={100} className="w-[100%]" />
					</div>

					<div className="flex justify-center gap-x-4 mb-3">
						<Button
							type="button"
							className="min-w-[8rem]"
							disabled={globalDownloading}
							onClick={startDownload}>
							Download
						</Button>
						{globalDownloading && (
							<Button
								type="button"
								className="min-w-[8rem]"
								disabled={!globalDownloading}
								onClick={startDownload}>
								Cancel
							</Button>
						)}

						<Button type="button" className="min-w-[8rem]" onClick={preview}>
							Preview
						</Button>
						<Button type="button" className="min-w-[8rem]" onClick={showSettings}>
							Settings
						</Button>
						<Button type="button" className="min-w-[8rem]" onClick={quit}>
							Quit
						</Button>
					</div>
				</section>
			</div>
			<SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
		</main>
	);
}

export default App;
