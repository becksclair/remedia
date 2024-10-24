<script lang="ts">
	import { invoke } from '@tauri-apps/api/core'
	import { listen, type Event } from '@tauri-apps/api/event'
	import { open } from '@tauri-apps/plugin-dialog'
	import { downloadDir } from '@tauri-apps/api/path'
	import { readText } from '@tauri-apps/plugin-clipboard-manager'
	import { isPermissionGranted, requestPermission, sendNotification } from '@tauri-apps/plugin-notification'

	import { onMount } from 'svelte'

	import * as Table from '$lib/components/ui/table'
	import { Button } from '$lib/components/ui/button'
	import { Input } from '$lib/components/ui/input'
	import { Progress } from '$lib/components/ui/progress'

	import MenuBar from '../components/menu-bar.svelte'
	import DropZone from '../components/drop-zone.svelte'
	import PLabel from '../components/p-label.svelte'

	type MediaProgressEvent = [number, number]
	type MediaInfoEvent = [number, string, string]

	const Status = {
		Pending: 'Pending',
		Downloading: 'Downloading',
		Done: 'Done',
		Error: 'Error',
	} as const

	type VideoStatus = (typeof Status)[keyof typeof Status]

	type VideoInfo = {
		url: string
		title: string
		thumbnail?: string
		audioOnly: boolean
		progress: number
		status: VideoStatus
	}

	let mediaList: VideoInfo[] = $state([])
	let outputLocation = $state('')
	let globalProgress = $state(0.0)
	let globalDownloading = $state(false)
	let dragHovering = $state(false)

	const urlSet = new Set(mediaList.map(item => item.url))

	// Set the default download directory to the user's download folder
	downloadDir().then(dir => (outputLocation = dir))

	// Do you have permission to send a notification?
	let notifPermission = false

	isPermissionGranted().then(granted => {
		if (!granted) {
			requestPermission().then(permission => (notifPermission = permission === 'granted'))
		}
	})

	async function chooseOutputLocation() {
		const directory = await open({
			title: 'Choose location to save downloads',
			multiple: false,
			directory: true,
		})
		if (directory) {
			outputLocation = directory
		}
	}

	async function startDownload() {
		globalProgress = 0
		globalDownloading = true

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
			globalDownloading = false
		}
	}

	async function preview() {
		if (notifPermission) {
			sendNotification({
				title: 'Download complete',
				body: 'Your video title finished downloading',
			})
		}
	}

	async function quit() {
		await invoke('quit')
	}

	const isUrl = (input: string) => /^https?:\/\//.test(input)

	function addMediaUrl(url: string) {
		if (urlSet.has(url)) return // No duplicate

		mediaList = [
			...mediaList,
			{
				title: url,
				url: url,
				status: 'Pending',
				progress: 0,
				audioOnly: false,
			},
		]
		urlSet.add(url)

		// Request media information
		const mediaIdx = mediaList.findIndex(m => m.url === url)
		void invoke('get_media_info', {
			mediaIdx,
			mediaSourceUrl: url,
		})
		dragHovering = false
	}

	async function clipboardIsUrl() {
		// Check if the clipboard content is a URL
		const clipboardContents = await readText()

		if (isUrl(clipboardContents)) {
			addMediaUrl(clipboardContents)
			console.log('URL added from clipboard')
		}
	}

	function updateMediaItem(index: number, updates: Partial<VideoInfo>) {
		mediaList[index] = { ...mediaList[index], ...updates }
		mediaList = mediaList
	}

	function handleWindowFocus() {
		clipboardIsUrl()
	}

	function onDragOver() {
		dragHovering = true
	}

	function onDragLeave() {
		dragHovering = false
	}

	function dropHandler(input: string) {
		// Validate if it's a URL
		if (isUrl(input)) {
			addMediaUrl(input)
		}
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

	// Reactive assignment for global progress
	$effect(() => {
		globalDownloading = mediaList.some(media => media.status === Status.Downloading)
		globalProgress = globalDownloading ? mediaList.reduce((acc, item) => acc + item.progress, 0) / mediaList.length : 0
	})

	onMount(() => {
		const unlisteners = [
			listen('update-media-info', handleMediaInfo),
			listen('download-progress', handleProgress),
			listen('download-complete', handleComplete),
			listen('download-error', handleError),
		]

		return () => {
			unlisteners.forEach(unlistener => unlistener.then(fn => fn()))
		}
	})
</script>

<svelte:window onfocus={handleWindowFocus} />

<main>
	<MenuBar />

	<div class="app-container gap-y-4">
		<div class="min-h-[20rem]" role="region" ondragenter={onDragOver} ondragleave={onDragLeave} ondragend={onDragLeave}>
			{#if dragHovering}
				<DropZone {dropHandler} />
			{:else}
				<Table.Root>
					<Table.Header>
						<Table.Row>
							<Table.Head class="w-[300px]">Thumbnail</Table.Head>
							<Table.Head class="w-[100%]">Title</Table.Head>
							<Table.Head class="min-w-[100px]">Progress</Table.Head>
							<Table.Head class="text-right">Status</Table.Head>
						</Table.Row>
					</Table.Header>
					<Table.Body>
						{#each mediaList as mediaItem, i (i)}
							<Table.Row>
								<Table.Cell>
									{#if mediaItem.thumbnail}
										<img class="h-[72px] w-auto" alt="Media thumbnail" src={mediaItem.thumbnail} />
									{/if}
								</Table.Cell>
								<Table.Cell class="font-medium">{mediaItem.title}</Table.Cell>
								<Table.Cell><Progress value={mediaItem.progress} max={100} class="w-[100%]" /></Table.Cell>
								<Table.Cell class="text-right">{mediaItem.status}</Table.Cell>
							</Table.Row>
						{/each}
					</Table.Body>
				</Table.Root>
			{/if}
		</div>

		<div>
			<PLabel>Select the location where you want to save the downloaded files:</PLabel>

			<div class="flex gap-x-4">
				<Input type="text" id="output-location-input" placeholder="Download location..." bind:value={outputLocation} />
				<Button type="button" class="min-w-[8rem]" on:click={chooseOutputLocation}>Browse...</Button>
			</div>
		</div>

		<div class="my-2">
			<Progress value={globalProgress} max={100} class="w-[100%]" />
		</div>

		<div class="flex justify-center gap-x-4">
			<Button type="button" class="min-w-[8rem]" disabled={globalDownloading} on:click={startDownload}>Download</Button>
			{#if globalDownloading}
				<Button type="button" class="min-w-[8rem]" disabled={!globalDownloading} on:click={startDownload}>Cancel</Button
				>
			{/if}

			<Button type="button" class="min-w-[8rem]" on:click={preview}>Preview</Button>
			<Button type="button" class="min-w-[8rem]" on:click={quit}>Quit</Button>
		</div>
	</div>
</main>
