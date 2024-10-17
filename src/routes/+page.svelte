<script lang="ts">
	import { invoke } from '@tauri-apps/api/core'
	import { listen } from '@tauri-apps/api/event'
	import { getCurrentWindow } from '@tauri-apps/api/window'
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

	type VideoInfo = {
		url: string
		title: string
		audioOnly: boolean
		progress: number
		status: 'pending' | 'downloading' | 'downloaded'
	}

	let mediaUrlList: VideoInfo[] = [
		{
			url: 'https://www.twitch.tv/videos/2277690290',
			title: 'Sample Video',
			audioOnly: false,
			progress: 0,
			status: 'pending'
		}
	]

	let outputLocation = ''
	let message = ''
	let progress = 0
	let downloading = false

	downloadDir().then(dir => (outputLocation = dir))

	// Do you have permission to send a notification?
	let notifPermission = false

	isPermissionGranted().then(granted => {
		if (!granted) {
			requestPermission().then(permission => {
				notifPermission = permission === 'granted'
			})
		}
	})

	async function chooseOutputLocation() {
		const directory = await open({
			title: 'Choose location to save downloads',
			multiple: false,
			directory: true
		})
		if (directory) {
			outputLocation = directory
			message = 'Output location set'
		}
	}

	async function startDownload() {
		progress = 0
		downloading = true
		message = 'Downloading...'

		try {
			for (const mediaUrl of mediaUrlList) {
				await invoke('download_media', {
					mediaSourceUrl: mediaUrl.url,
					outputLocation: outputLocation
				})
			}
		} catch (err) {
			console.error('Error starting download:', err)
			message = 'Error starting download'
			downloading = false
		}
	}

	async function preview() {
		if (notifPermission) {
			sendNotification({
				title: 'Download complete',
				body: 'Your video title finished downloading'
			})
		}
	}

	async function quit() {
		await invoke('quit')
	}

	function isUrl(input: string): boolean {
		return input.startsWith('http')
	}

	function dropHandler(input: string) {
		// Validate if it's a URL
		if (isUrl(input)) {
			addMediaUrl(input)
			message = `Dropped URL: ${input}`
		}
	}

	function addMediaUrl(url: string) {
		mediaUrlList = [
			...mediaUrlList,
			{
				title: url,
				url: url,
				status: 'pending',
				progress: 0,
				audioOnly: false
			}
		]
	}

	onMount(() => {
		const clipboardIsUrl = async () => {
			// Check if the clipboard content is a URL
			const clipboardContents = await readText()

			if (isUrl(clipboardContents)) {
				addMediaUrl(clipboardContents)
				message = 'URL added from clipboard'
			}
		}

		const unlistenFocus = getCurrentWindow().onFocusChanged(({ payload: focused }) => {
			if (focused) {
				clipboardIsUrl()
			}
		})

		const unlistenProgress = listen('download-progress', event => {
			progress = event.payload as number
		})

		const unlistenComplete = listen('download-complete', () => {
			downloading = false
			progress = 100
			message = 'Download complete'
		})

		const unlistenError = listen('download-error', () => {
			downloading = false
			message = 'Download failed'
		})

		return () => {
			unlistenFocus.then(fn => fn())
			unlistenProgress.then(fn => fn())
			unlistenComplete.then(fn => fn())
			unlistenError.then(fn => fn())
		}
	})
</script>

<main class="">
	<MenuBar />

	<div class="container gap-y-4">
		<DropZone {dropHandler} />

		<div class="min-h-[20rem]">
			<Table.Root>
				<Table.Header>
					<Table.Row>
						<Table.Head class="w-[100px]">Title</Table.Head>
						<Table.Head>URL</Table.Head>
						<Table.Head>Progress</Table.Head>
						<Table.Head class="text-right">Status</Table.Head>
					</Table.Row>
				</Table.Header>
				<Table.Body>
					{#each mediaUrlList as mediaUrl, i (i)}
						<Table.Row>
							<Table.Cell class="font-medium">{mediaUrl.title}</Table.Cell>
							<Table.Cell>{mediaUrl.url}</Table.Cell>
							<Table.Cell><Progress value={mediaUrl.progress} max={100} class="w-[100%]" /></Table.Cell>
							<Table.Cell class="text-right">{mediaUrl.status}</Table.Cell>
						</Table.Row>
					{/each}
				</Table.Body>
			</Table.Root>
		</div>

		<div>
			<PLabel>Select the location where you want to save the downloaded files:</PLabel>

			<div class="flex gap-x-4">
				<Input type="text" id="output-location-input" placeholder="Download location..." bind:value={outputLocation} />
				<Button type="button" class="min-w-[8rem]" on:click={chooseOutputLocation}>Browse...</Button>
			</div>
		</div>

		<div class="my-2">
			<Progress value={progress} max={100} class="w-[100%]" />
			<div class="flex justify-center">
				<PLabel className="py-2">
					{message}
				</PLabel>
				<p></p>
			</div>
		</div>

		<div class="flex justify-center gap-x-4">
			<Button type="button" class="min-w-[8rem]" disabled={downloading} on:click={startDownload}>Download</Button>
			{#if downloading}
				<Button type="button" class="min-w-[8rem]" disabled={!downloading} on:click={startDownload}>Cancel</Button>
			{/if}

			<Button type="button" class="min-w-[8rem]" on:click={preview}>Preview</Button>
			<Button type="button" class="min-w-[8rem]" on:click={quit}>Quit</Button>
		</div>
	</div>
</main>

<style>
	:root {
		font-size: 14px;

		font-synthesis: none;
		text-rendering: optimizeLegibility;
		-webkit-font-smoothing: antialiased;
		-moz-osx-font-smoothing: grayscale;
		-webkit-text-size-adjust: 100%;
	}

	.container {
		margin: 0;
		padding: 1rem;
		display: flex;
		flex-direction: column;
		justify-content: center;
	}

	@media (prefers-color-scheme: dark) {
		:root {
			color: #f6f6f6;
			background-color: #2f2f2f;
		}
	}
</style>
