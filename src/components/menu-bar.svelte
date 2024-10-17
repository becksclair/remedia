<script lang="ts">
    import * as Menubar from "$lib/components/ui/menubar/index.js";

    export let alwaysOnTop = false;
</script>

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
            <Menubar.CheckboxItem bind:checked={alwaysOnTop}
                >Always on top</Menubar.CheckboxItem
            >
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
</Menubar.Root>
