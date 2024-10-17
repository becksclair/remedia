<script lang="ts">
  import { invoke } from "@tauri-apps/api/core";
  import { listen } from "@tauri-apps/api/event";
  import { getCurrentWindow } from "@tauri-apps/api/window";
  import { open } from "@tauri-apps/plugin-dialog";
  import { downloadDir } from "@tauri-apps/api/path";

  import Sun from "svelte-radix/Sun.svelte";
  import Moon from "svelte-radix/Moon.svelte";
  import { toggleMode } from "mode-watcher";

  import { onMount } from "svelte";
  import * as Menubar from "$lib/components/ui/menubar/index.js";
  import * as Table from "$lib/components/ui/table/index.js";
  import { Button } from "$lib/components/ui/button/index.js";
  import { Input } from "$lib/components/ui/input/index.js";
  import { Progress } from "$lib/components/ui/progress/index.js";
  import { Separator } from "../lib/components/ui/separator";

  import { readText } from "@tauri-apps/plugin-clipboard-manager";

  type VideoInfo = {
    url: string;
    title: string;
    audioOnly: boolean;
    progress: number;
    status: "pending" | "downloading" | "downloaded";
  };

  let mediaUrlList: VideoInfo[] = [
    {
      url: "https://www.youtube.com/watch?v=JxRLX4VGuYg",
      title: "Sample Video",
      audioOnly: false,
      progress: 0,
      status: "pending",
    },
  ];

  let outputLocation = "";
  let mediaSourceUrl = "https://www.youtube.com/watch?v=JxRLX4VGuYg";
  let message = "";
  let progress = 0;
  let downloading = false;

  let bookmarks = false;
  let fullUrls = true;

  downloadDir().then((dir) => (outputLocation = dir));

  const profileRadioValue = "benoit";

  async function chooseOutputLocation() {
    const directory = await open({
      title: "Choose location to save downloads",
      multiple: false,
      directory: true,
    });
    if (directory) {
      outputLocation = directory;
      message = "Output location set";
    }
  }

  async function startDownload() {
    progress = 0;
    downloading = true;
    message = "Downloading...";

    try {
      await invoke("download", { mediaSourceUrl });
    } catch (err) {
      console.error("Error starting download:", err);
      message = "Error starting download";
      downloading = false;
    }
  }

  async function quit() {
    await invoke("quit");
  }

  onMount(() => {
    const clipboardIsUrl = async () => {
      // Check if the clipboard content is a URL
      const clipboardContents = await readText();
      const isUrl = clipboardContents.match(
        /https?:\/\/(www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_\+.~#?&//=]*)/,
      );

      if (isUrl) {
        mediaSourceUrl = clipboardContents;
        message = "URL added from clipboard";
      }
    };

    const unlistenFocus = getCurrentWindow().onFocusChanged(
      ({ payload: focused }) => {
        if (focused) {
          clipboardIsUrl();
        }
      },
    );

    const unlistenProgress = listen("download-progress", (event) => {
      progress = event.payload as number;
    });

    const unlistenComplete = listen("download-complete", () => {
      downloading = false;
      progress = 100;
      message = "Download complete";
    });

    const unlistenError = listen("download-error", () => {
      downloading = false;
      message = "Download failed";
    });

    return () => {
      unlistenFocus.then((fn) => fn());
      unlistenProgress.then((fn) => fn());
      unlistenComplete.then((fn) => fn());
      unlistenError.then((fn) => fn());
    };
  });
</script>

<main class="">
  <Menubar.Root>
    <Menubar.Menu>
      <Menubar.Trigger>File</Menubar.Trigger>
      <Menubar.Content>
        <Menubar.Item>
          New Tab <Menubar.Shortcut>⌘T</Menubar.Shortcut>
        </Menubar.Item>
        <Menubar.Item>
          New Window <Menubar.Shortcut>⌘N</Menubar.Shortcut>
        </Menubar.Item>
        <Menubar.Item>New Incognito Window</Menubar.Item>
        <Menubar.Separator />
        <Menubar.Sub>
          <Menubar.SubTrigger>Share</Menubar.SubTrigger>
          <Menubar.SubContent>
            <Menubar.Item>Email link</Menubar.Item>
            <Menubar.Item>Messages</Menubar.Item>
            <Menubar.Item>Notes</Menubar.Item>
          </Menubar.SubContent>
        </Menubar.Sub>
        <Menubar.Separator />
        <Menubar.Item>
          Exit <Menubar.Shortcut>⌘Q</Menubar.Shortcut>
        </Menubar.Item>
      </Menubar.Content>
    </Menubar.Menu>
    <Menubar.Menu>
      <Menubar.Trigger>Edit</Menubar.Trigger>
      <Menubar.Content>
        <Menubar.Sub>
          <Menubar.SubTrigger>Find</Menubar.SubTrigger>
          <Menubar.SubContent>
            <Menubar.Item>Search the web</Menubar.Item>
            <Menubar.Separator />
            <Menubar.Item>Find...</Menubar.Item>
            <Menubar.Item>Find Next</Menubar.Item>
            <Menubar.Item>Find Previous</Menubar.Item>
          </Menubar.SubContent>
        </Menubar.Sub>
        <Menubar.Separator />
        <Menubar.Item>
          Cut <Menubar.Shortcut>⌘X</Menubar.Shortcut>
        </Menubar.Item>
        <Menubar.Item>
          Copy <Menubar.Shortcut>⌘C</Menubar.Shortcut>
        </Menubar.Item>
        <Menubar.Item>
          Paste <Menubar.Shortcut>⌘V</Menubar.Shortcut>
        </Menubar.Item>
      </Menubar.Content>
    </Menubar.Menu>
    <Menubar.Menu>
      <Menubar.Trigger>View</Menubar.Trigger>
      <Menubar.Content>
        <Menubar.CheckboxItem bind:checked={bookmarks}
          >Always Show Bookmarks Bar</Menubar.CheckboxItem
        >
        <Menubar.CheckboxItem bind:checked={fullUrls}>
          Always Show Full URLs
        </Menubar.CheckboxItem>
        <Menubar.Separator />
        <Menubar.Item inset>
          Reload <Menubar.Shortcut>⌘R</Menubar.Shortcut>
        </Menubar.Item>
        <Menubar.Item inset>
          Force Reload <Menubar.Shortcut>⇧⌘R</Menubar.Shortcut>
        </Menubar.Item>
        <Menubar.Separator />
        <Menubar.Item inset>Toggle Fullscreen</Menubar.Item>
        <Menubar.Separator />
        <Menubar.Item inset>Hide Sidebar</Menubar.Item>
      </Menubar.Content>
    </Menubar.Menu>
    <Menubar.Menu>
      <Menubar.Trigger>Profiles</Menubar.Trigger>
      <Menubar.Content>
        <Menubar.RadioGroup value={profileRadioValue}>
          <Menubar.RadioItem value="andy">Andy</Menubar.RadioItem>
          <Menubar.RadioItem value="benoit">Benoit</Menubar.RadioItem>
          <Menubar.RadioItem value="Luis">Luis</Menubar.RadioItem>
        </Menubar.RadioGroup>
        <Menubar.Separator />
        <Menubar.Item inset>Edit...</Menubar.Item>
        <Menubar.Separator />
        <Menubar.Item inset>Add Profile...</Menubar.Item>
      </Menubar.Content>
    </Menubar.Menu>
  </Menubar.Root>

  <div class="container gap-y-4">
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
              <Table.Cell
                ><Progress
                  value={mediaUrl.progress}
                  max={100}
                  class="w-[100%]"
                /></Table.Cell
              >
              <Table.Cell class="text-right">{mediaUrl.status}</Table.Cell>
            </Table.Row>
          {/each}
        </Table.Body>
      </Table.Root>
    </div>

    <div>
      <p class="text-sm font-medium leading-none py-3">
        Select the location where you want to save the downloaded files:
      </p>
      <div class="flex gap-x-4">
        <Input
          type="text"
          id="output-location-input"
          placeholder="Download location..."
          bind:value={outputLocation}
        />
        <Button
          type="button"
          class="min-w-[8rem]"
          on:click={chooseOutputLocation}>Browse...</Button
        >
      </div>
    </div>

    <div class="my-2">
      <Progress value={progress} max={100} class="w-[100%]" />
      <div class="flex justify-center">
        <p class="text-sm font-medium leading-none py-2">{message}</p>
      </div>
    </div>

    <div class="flex justify-center gap-x-4">
      <Button
        type="button"
        class="min-w-[8rem]"
        disabled={downloading}
        on:click={startDownload}>Download</Button
      >
      {#if downloading}
        <Button
          type="button"
          class="min-w-[8rem]"
          disabled={!downloading}
          on:click={startDownload}>Cancel</Button
        >
        #{/if}

      <Button
        type="button"
        class="min-w-[8rem]"
        disabled={downloading}
        on:click={startDownload}>Preview</Button
      >

      <Button type="button" class="min-w-[8rem]" on:click={quit}>Quit</Button>
    </div>

    <!-- <div>
      <p class="text-sm font-medium leading-none py-3">
        Enter the URL of the media you want to download:
      </p>
      <div class="flex gap-x-4">
        <Input
          type="url"
          id="source-url-input"
          placeholder="Enter a video or audio url..."
          disabled={downloading}
          bind:value={mediaSourceUrl}
        />
        <Button
          type="button"
          class="min-w-[8rem]"
          disabled={downloading}
          on:click={startDownload}>Download</Button
        >
      </div>
    </div> -->
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
