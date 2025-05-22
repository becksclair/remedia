import { invoke } from "@tauri-apps/api/core"
import type { Event } from "@tauri-apps/api/event"
import { downloadDir } from "@tauri-apps/api/path"
import { readText } from "@tauri-apps/plugin-clipboard-manager"
import { open as openDialog } from "@tauri-apps/plugin-dialog"
import { isPermissionGranted, requestPermission, sendNotification } from "@tauri-apps/plugin-notification"

import { useEffect, useState } from "react"
import { DropZone } from "./components/drop-zone.tsx"
import { PLabel } from "./components/p-label.tsx"
import { Button } from "./components/ui/button.tsx"
import { Input } from "./components/ui/input.tsx"
import { Progress } from "./components/ui/progress.tsx"
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger
} from "@/components/ui/dropdown-menu"

import type { ColumnDef } from "@tanstack/react-table"
import { MoreHorizontal } from "lucide-react"

import { useWindowFocus } from "@/hooks/use-window-focus"
import { type MediaInfoEvent, type MediaProgressEvent, useTauriEvents } from "@/hooks/useTauriEvent"

import { DataTable } from "./components/data-table.tsx"
import { Checkbox } from "./components/ui/checkbox.tsx"

import { SettingsDialog } from "./components/settings-dialog"

import "./App.css"

import { useAtom } from 'jotai'
import { downloadLocationAtom } from "@/state/settings-atoms"

type VideoInfo = {
	url: string
	title: string
	thumbnail?: string
	audioOnly: boolean
	progress: number
	status: "Pending" | "Downloading" | "Done" | "Error"
}

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
			const thumbnail = row.getValue("thumbnail")
			if (!thumbnail) return <div className="h-[72px] w-auto" />

			return <img className="h-[72px] w-auto" alt="Media thumbnail" src={thumbnail as string} />
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
			)
		},
		header: () => <div className="text-center">Audio</div>
	},
	{
		accessorKey: "progress",
		cell: ({ row }) => {
			return <Progress value={row.getValue("progress")} />
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
						<DropdownMenuSeparator />
						<DropdownMenuItem>View customer</DropdownMenuItem>
						<DropdownMenuItem>View payment details</DropdownMenuItem>
					</DropdownMenuContent>
				</DropdownMenu>
			)
		},
		id: "actions"
	}
]

function debounce(callback: () => void, delay: number) {
	let timer: NodeJS.Timeout
	return () => {
		clearTimeout(timer)
		timer = setTimeout(callback, delay)
	}
}

function App() {
	const [notificationPermission, setNotificationPermission] = useState(false)
	const [dragHovering, setDragHovering] = useState(false)
	const [mediaList, setMediaList] = useState<VideoInfo[]>([])
	const [outputLocation, setOutputLocation] = useAtom(downloadLocationAtom)
	const [globalProgress, setGlobalProgress] = useState(0)
	const [globalDownloading, setGlobalDownloading] = useState(false)
	const [settingsOpen, setSettingsOpen] = useState(false)

	const handleDragOver = (event: React.DragEvent<HTMLDivElement>) => {
		event.preventDefault()
		setDragHovering(true)
	}

	const handleDragLeave = (event: React.DragEvent<HTMLDivElement>) => {
		event.preventDefault()
		debounce(() => setDragHovering(false), 300)
	}

	isPermissionGranted().then(granted => {
		if (!granted) {
			requestPermission().then(permission => {
				setNotificationPermission(permission === "granted")
			})
		}
	})

	async function chooseOutputLocation() {
		const directory = await openDialog({
			defaultPath: outputLocation,
			directory: true,
			multiple: false,
			title: "Choose location to save downloads"
		})
		if (directory && typeof directory === 'string') {
			setOutputLocation(directory)
		}
	}

	async function startDownload() {
		setGlobalProgress(0)
		setGlobalDownloading(true)

		try {
			await Promise.all(
				mediaList.map((media, i) =>
					invoke("download_media", {
						mediaIdx: i,
						mediaSourceUrl: media.url,
						outputLocation: outputLocation
					})
				)
			)
		} catch (err) {
			console.error("Error starting download:", err)
			alert("Error starting download")
			setGlobalDownloading(false)
		}
	}

	async function preview() {
		if (notificationPermission) {
			sendNotification({
				body: "Your video title finished downloading",
				title: "Download complete"
			})
		}
	}

	async function showSettings() {
		setSettingsOpen(true)
	}

	async function quit() {
		await invoke("quit")
	}

	const isUrl = (input: string) => /^https?:\/\//.test(input)

	function addMediaUrl(url: string) {
		const newMedia = {
			audioOnly: false,
			progress: 0,
			status: "Pending",
			title: url,
			url: url,
			thumbnail: ""
		} as VideoInfo

		const updatedMediaList = [...mediaList, newMedia]
		const mediaIdx = updatedMediaList.findIndex(m => m.url === url)

		setMediaList(updatedMediaList)

		// Request media information
		void invoke("get_media_info", {
			mediaIdx,
			mediaSourceUrl: url
		})
	}

	async function clipboardIsUrl() {
		// Check if the clipboard content is a URL
		readText()
			.then(text => {
				if (isUrl(text)) {
					addMediaUrl(text)
					console.log("URL added from clipboard")
				}
			})
			.catch(err => {
				console.error("Error reading clipboard:", err)
			})
	}

	const updateMediaItem = (updates: Partial<VideoInfo>) => {
		if (!updates.url) return

		setMediaList(prevList => {
			// Remove any items where title equals updates.url
			const filtered = prevList.filter(item => item.title !== updates.url)

			const newMedia = {
				audioOnly: false,
				progress: 0,
				status: "Pending",
				title: updates.title,
				url: updates.url,
				thumbnail: updates.thumbnail
			} as VideoInfo

			// If filtered contains an item with the same title as updates.title, merge it
			const idx = filtered.findIndex(item => item.title === updates.title)

			if (idx !== -1) {
				filtered[idx] = {
					...filtered[idx],
					...updates
				}
			} else {
				filtered.push(newMedia)
			}

			return [...filtered]
		})
	}

	function dropHandler(input: string) {
		setDragHovering(false)

		if (isUrl(input)) {
			addMediaUrl(input)
		}
	}

	function handleWindowFocus() {
		void clipboardIsUrl()
	}

	const handleMediaInfo = ({ payload: [_mediaIdx, mediaSourceUrl, title, thumbnail] }: Event<MediaInfoEvent>) => {
		updateMediaItem({ thumbnail, title, url: mediaSourceUrl })
	}

	const handleProgress = (event: Event<MediaProgressEvent>) => {
		const [_mediaIdx, progress] = event.payload as MediaProgressEvent
		updateMediaItem({ progress })
	}

	const handleComplete = (_event: Event<number>) => {
		updateMediaItem({ progress: 100, status: "Done" })
	}
	const handleError = (_event: Event<number>) => {
		updateMediaItem({ status: "Error" })
	}

	useWindowFocus(handleWindowFocus)

	useEffect(() => {
		isPermissionGranted().then(granted => {
			if (!granted) {
				requestPermission().then(permission => {
					setNotificationPermission(permission === "granted")
				})
			}
			setNotificationPermission(granted)
		})
	}, [])

	useEffect(() => {
		// Set the default download directory to the user's download folder
		downloadDir()
			.then(dir => setOutputLocation(dir))
			.catch(error => {
				console.error("Failed to get download directory:", error)
			})
	}, [setOutputLocation])


	// You could alternatively use the new useTauriEvents hook, uncomment this to try it:
	useTauriEvents({
		"update-media-info": handleMediaInfo,
		"download-progress": handleProgress,
		"download-complete": handleComplete,
		"download-error": handleError
	})

	// Handle dynamic updating of global download status and progress
	useEffect(() => {
		setGlobalDownloading(mediaList.some(media => media.status === "Downloading"))
		setGlobalProgress(
			globalDownloading ? mediaList.reduce((acc, item) => acc + item.progress, 0) / mediaList.length : 0
		)
	}, [mediaList, globalDownloading])

	return (
		<main className="container" onDragOver={handleDragOver} onDragLeave={handleDragLeave}>
			<div className="app-container compact flex flex-col justify-between gap-y-4 h-screen">
				<DropZone
					className="flex-auto grow overflow-y-auto"
					dropHandler={dropHandler}
					dragHovering={dragHovering}
				/>
				{/* Drop Zone + Data View */}
				<DataTable className="flex-auto grow overflow-y-auto" columns={MediaListColumns} data={mediaList} />

				<section className="flex-none flex flex-col gap-y-4">
					<div>
						<PLabel className="text-lg mt-3 mb-2">
							Select the location where you want to save the downloaded files
						</PLabel>

						<div className="flex gap-x-4 mb-3">
							<Input
								type="text"
								id="output-location-input"
								className="text-sm"
								placeholder="Download location..."
								value={outputLocation}
								onChange={e => setOutputLocation(e.target.value)}
							/>
							<Button type="button" className="min-w-[8rem]" onClick={chooseOutputLocation}>
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
			<SettingsDialog
				open={settingsOpen}
				onOpenChange={setSettingsOpen}
			/>
		</main>
	)
}

export default App
