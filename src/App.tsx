import { invoke } from "@tauri-apps/api/core";
import { downloadDir } from "@tauri-apps/api/path";
import { readText } from "@tauri-apps/plugin-clipboard-manager";
import { open } from "@tauri-apps/plugin-dialog";
import { listen, type Event } from "@tauri-apps/api/event";
import {
	isPermissionGranted,
	requestPermission,
	sendNotification,
} from "@tauri-apps/plugin-notification";

import { useState, useEffect } from "react";

import { Button } from "./components/ui/button";
import { Input } from "./components/ui/input";
import { Progress } from "./components/ui/progress";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

import { PLabel } from "./components/p-label";
import { DropZone } from "./components/drop-zone";

import "./App.css";
import { useWindowFocus } from "@/hooks/use-window-focus";

type MediaProgressEvent = [number, number];
type MediaInfoEvent = [number, string, string];

const Status = {
	Pending: "Pending",
	Downloading: "Downloading",
	Done: "Done",
	Error: "Error",
} as const;

type VideoStatus = (typeof Status)[keyof typeof Status];

type VideoInfo = {
	url: string;
	title: string;
	thumbnail?: string;
	audioOnly: boolean;
	progress: number;
	status: VideoStatus;
};

function App() {
	const [urlSet, setUrlSet] = useState<Set<string>>(new Set());
	const [mediaList, setMediaList] = useState<VideoInfo[]>([]);
	const [outputLocation, setOutputLocation] = useState<string>('');
	const [globalProgress, setGlobalProgress] = useState(0.0);
	const [globalDownloading, setGlobalDownloading] = useState(false);

	const [dragHovering, setDragHovering] = useState(false);

	const handleDragOver = (event: React.DragEvent<HTMLDivElement>) => {
			event.preventDefault();
			setDragHovering(true);
		};

		const handleDragLeave = () => {
			setDragHovering(false);
		};

	// Do you have permission to send a notification?
	let notificationPermission = false;

	isPermissionGranted().then((granted) => {
		if (!granted) {
			requestPermission().then((permission) => {
				notificationPermission = permission === "granted";
			});
		}
	});

	async function chooseOutputLocation() {
		const directory = await open({
			title: "Choose location to save downloads",
			multiple: false,
			directory: true,
			defaultPath: outputLocation
		});
		if (directory) {
			setOutputLocation(directory);
		}
	}

	async function startDownload() {
		setGlobalProgress(0.0);
		setGlobalDownloading(true);

		try {
			await Promise.all(
				mediaList.map((media, i) =>
					invoke('download_media', {
						mediaIdx: i,
						mediaSourceUrl: media.url,
						outputLocation: outputLocation,
					}),
				),
			)
		} catch (err) {
			console.error('Error starting download:', err)
			alert('Error starting download')
			setGlobalDownloading(false);
		}
	}

	async function preview() {
		if (notificationPermission) {
			sendNotification({
				title: 'Download complete',
				body: 'Your video title finished downloading',
			})
		}
	}

	async function quit() {
		await invoke('quit')
	}

	const isUrl = (input: string) => /^https?:\/\//.test(input);

	function addMediaUrl(url: string) {
		if (urlSet.has(url)) return; // No duplicate

		const newMedia = {
			title: url,
			url: url,
			status: "Pending",
			progress: 0.0,
			audioOnly: false,
		} as VideoInfo;
		const updatedMediaList = [...mediaList, newMedia];
		const mediaIdx = updatedMediaList.findIndex((m) => m.url === url);

		setMediaList(updatedMediaList);
		urlSet.add(url);

		// Request media information
		void invoke("get_media_info", {
			mediaIdx,
			mediaSourceUrl: url,
		});
	}

	async function clipboardIsUrl() {
		// Check if the clipboard content is a URL
		const clipboardContents = await readText();

		if (isUrl(clipboardContents)) {
			addMediaUrl(clipboardContents);
			console.log("URL added from clipboard");
		}
	}

	function updateMediaItem(index: number, updates: Partial<VideoInfo>) {
		mediaList[index] = { ...mediaList[index], ...updates };
		setMediaList(mediaList);
	}

	function dropHandler(input: string) {
		// Validate if it's a URL
		if (isUrl(input)) {
			addMediaUrl(input);
		}
	}

	function handleWindowFocus() {
		clipboardIsUrl();
	}

	function handleMediaInfo({ payload: [mediaIdx, title, thumbnail] }: Event<MediaInfoEvent>) {
		console.log(mediaIdx, title, thumbnail)
		updateMediaItem(mediaIdx, { title, thumbnail })
	}
	function handleProgress(event: Event<MediaProgressEvent>) {
		const [mediaIdx, progress] = event.payload as MediaProgressEvent
		updateMediaItem(mediaIdx, { progress })
	}

	function handleComplete(event: Event<number>) {
		const mediaIdx = event.payload as number
		updateMediaItem(mediaIdx, { progress: 100, status: 'Done' })
	}

	function handleError(event: Event<number>) {
		const mediaIdx = event.payload as number
		updateMediaItem(mediaIdx, { status: 'Error' })
	}

	useWindowFocus(handleWindowFocus);

	// Setup Effect
	// biome-ignore lint/correctness/useExhaustiveDependencies: <explanation>
	useEffect(() => {
		let unlisteners: (() => void)[] = [];

		const setup = async () => {
			unlisteners = [
				await listen('update-media-info', handleMediaInfo),
				await listen('download-progress', handleProgress),
				await listen('download-complete', handleComplete),
				await listen('download-error', handleError),
			];
		};

		setup();
		// window.addEventListener('focus', handleWindowFocus);

		// Set the default download directory to the user's download folder
		downloadDir().then((dir) => setOutputLocation(dir));

		return () => {
			for (const unlisten of unlisteners) {
				try {
					unlisten();
					// window.removeEventListener('focus', handleWindowFocus);
				}
				catch (err) {
					console.warn('Error during unlisten:', err);
				}
			}
		};
	}, []); // Empty dependency array indicates the effect should only run once

	// Handle filtering duplicates when adding media URLs
	useEffect(() => {
		setUrlSet(new Set(mediaList.map((media) => media.url)));
	}, [mediaList]);

	// Handle dynamic updating of global download status and progress
	useEffect(() => {
		setGlobalDownloading(mediaList.some(media => media.status === Status.Downloading));
		setGlobalProgress(globalDownloading
			? mediaList.reduce((acc, item) => acc + item.progress, 0) / mediaList.length
			: 0)
	}, [mediaList, globalDownloading]);


	return (
		<main className="container">
			<div className="app-container gap-y-4">
				<section className="min-h-[18rem] max-h-[18rem] overflow-y-auto"
					onDragOver={handleDragOver}
					onDragLeave={handleDragLeave}
				>
						<DropZone dropHandler={dropHandler}
							style={{
								pointerEvents: dragHovering ? 'auto' : 'none',
							}}
						/>

						<Table className="">
							<TableHeader>
								<TableRow>
									<TableHead className="w-[300px]">Thumbnail</TableHead>
									<TableHead className="w-[90%]">Title</TableHead>
									<TableHead className="min-w-[100px]">Progress</TableHead>
									<TableHead className="text-right">Status</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{mediaList.map((mediaItem, idx) => (
									<TableRow key={`${mediaItem.title}_${idx}`}>
										<TableCell>
											{mediaItem.thumbnail &&
												<img className="h-[72px] w-auto" alt="Media thumbnail" src={mediaItem.thumbnail} />
											}
										</TableCell>

										<TableCell className="font-medium">
											<div className="text-left wrap-break-word w-96 overflow-ellipsis overflow-clip">
												{mediaItem.title}
											</div>
										</TableCell>

										<TableCell>
											<Progress value={mediaItem.progress} max={100} className="w-[100%]" />
										</TableCell>

										<TableCell className="text-right">
											{mediaItem.status}
										</TableCell>
									</TableRow>
								))}
							</TableBody>
						</Table>
				</section>

				<div>
					<PLabel>
						Select the location where you want to save the downloaded files:
					</PLabel>

					<div className="flex gap-x-4">
						<Input
							type="text"
							id="output-location-input"
							placeholder="Download location..."
							value={outputLocation}
							onChange={(e) => setOutputLocation(e.target.value)}
						/>
						<Button
							type="button"
							className="min-w-[8rem]"
							onClick={chooseOutputLocation}
						>
							Browse...
						</Button>
					</div>
				</div>

				<div className="my-2">
					<Progress value={globalProgress} max={100} className="w-[100%]" />
				</div>

				<div className="flex justify-center gap-x-4">
					<Button
						type="button"
						className="min-w-[8rem]"
						disabled={globalDownloading}
						onClick={startDownload}>Download</Button
					>
					{globalDownloading &&
						<Button
							type="button"
							className="min-w-[8rem]"
							disabled={!globalDownloading}
							onClick={startDownload}>Cancel</Button
						>
					}

					<Button type="button" className="min-w-[8rem]" onClick={preview}>Preview</Button>
					<Button type="button" className="min-w-[8rem]" onClick={quit}>Quit</Button>
				</div>
			</div>
		</main>
	);
}

export default App;
