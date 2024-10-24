<script lang="ts">
	import { toggleMode } from 'mode-watcher'
	import * as Menubar from '$lib/components/ui/menubar'

	interface Props {
		alwaysOnTop?: boolean;
	}

	let { alwaysOnTop = $bindable(false) }: Props = $props();
	let darkMode = $state(false)
</script>

<Menubar.Root>
	<Menubar.Menu>
		<Menubar.Trigger>File</Menubar.Trigger>
		<Menubar.Content>
			<Menubar.Item>
				Add URL... <Menubar.Shortcut>⌘A</Menubar.Shortcut>
			</Menubar.Item>
			<Menubar.Item>
				Add from clipboard <Menubar.Shortcut>⌘V</Menubar.Shortcut>
			</Menubar.Item>
			<Menubar.Item>
				Copy all URLs <Menubar.Shortcut>⇧⌘C</Menubar.Shortcut>
			</Menubar.Item>
			<Menubar.Item>
				Export URL list... <Menubar.Shortcut>⌘E</Menubar.Shortcut>
			</Menubar.Item>
			<Menubar.Separator />
			<Menubar.Item>Preferences...<Menubar.Shortcut>⌘,</Menubar.Shortcut></Menubar.Item>
			<Menubar.Separator />
			<Menubar.Item>
				Exit <Menubar.Shortcut>⌘Q</Menubar.Shortcut>
			</Menubar.Item>
		</Menubar.Content>
	</Menubar.Menu>
	<Menubar.Menu>
		<Menubar.Trigger>Find</Menubar.Trigger>
		<Menubar.Content>
			<Menubar.Item>Search the web <Menubar.Shortcut>⌘F</Menubar.Shortcut></Menubar.Item>
			<Menubar.Item>Find...<Menubar.Shortcut>⇧⌘F</Menubar.Shortcut></Menubar.Item>
		</Menubar.Content>
	</Menubar.Menu>
	<Menubar.Menu>
		<Menubar.Trigger>View</Menubar.Trigger>
		<Menubar.Content>
			<Menubar.CheckboxItem bind:checked={alwaysOnTop}>
				Always on top <Menubar.Shortcut>⇧⌘O</Menubar.Shortcut>
			</Menubar.CheckboxItem>
			<Menubar.CheckboxItem bind:checked={darkMode} on:click={toggleMode}>
				Dark mode <Menubar.Shortcut>⇧⌘D</Menubar.Shortcut>
			</Menubar.CheckboxItem>
			<Menubar.Separator />
			<Menubar.Item inset>
				Reload <Menubar.Shortcut>⌘R</Menubar.Shortcut>
			</Menubar.Item>
		</Menubar.Content>
	</Menubar.Menu>
	<Menubar.Menu>
		<Menubar.Trigger>Help</Menubar.Trigger>
		<Menubar.Content>
			<Menubar.Item inset>About...</Menubar.Item>
		</Menubar.Content>
	</Menubar.Menu>
</Menubar.Root>
