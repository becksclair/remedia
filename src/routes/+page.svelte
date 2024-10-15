<script lang="ts">
  import { invoke } from "@tauri-apps/api/core";
  import * as Menubar from "$lib/components/ui/menubar/index.js";
  import { Button } from "$lib/components/ui/button/index.js";
  import { Input } from "$lib/components/ui/input/index.js";

  let name = "";
  let greetMsg = "";

  let bookmarks = false;
  let fullUrls = true;

  const profileRadioValue = "benoit";

  async function greet() {
    // Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
    greetMsg = await invoke("greet", { name });
  }
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
          Print... <Menubar.Shortcut>⌘P</Menubar.Shortcut>
        </Menubar.Item>
      </Menubar.Content>
    </Menubar.Menu>
    <Menubar.Menu>
      <Menubar.Trigger>Edit</Menubar.Trigger>
      <Menubar.Content>
        <Menubar.Item>
          Undo <Menubar.Shortcut>⌘Z</Menubar.Shortcut>
        </Menubar.Item>
        <Menubar.Item>
          Redo <Menubar.Shortcut>⇧⌘Z</Menubar.Shortcut>
        </Menubar.Item>
        <Menubar.Separator />
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
        <Menubar.Item>Cut</Menubar.Item>
        <Menubar.Item>Copy</Menubar.Item>
        <Menubar.Item>Paste</Menubar.Item>
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

  <div class="container">
    <div class="row">
      <p>Click on the Tauri, Vite, and SvelteKit logos to learn more.</p>
    </div>

    <form class="row" on:submit|preventDefault={greet}>
      <Input
        type="text"
        id="greet-input"
        placeholder="Enter a name..."
        bind:value={name}
      />
      <Button type="submit">Greet</Button>
    </form>
    <p>{greetMsg}</p>
  </div>
</main>

<style>
  :root {
    font-family: Inter, Avenir, Helvetica, Arial, sans-serif;
    font-size: 16px;
    line-height: 24px;
    font-weight: 400;

    color: #0f0f0f;
    background-color: #f6f6f6;

    font-synthesis: none;
    text-rendering: optimizeLegibility;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
    -webkit-text-size-adjust: 100%;
  }

  .container {
    margin: 0;
    padding-top: 10vh;
    display: flex;
    flex-direction: column;
    justify-content: center;
    text-align: center;
  }

  .row {
    display: flex;
    justify-content: center;
  }

  @media (prefers-color-scheme: dark) {
    :root {
      color: #f6f6f6;
      background-color: #2f2f2f;
    }
  }
</style>
