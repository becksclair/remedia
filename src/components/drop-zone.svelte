<script lang="ts">
	interface Props {
		dropHandler: (url: string) => void;
	}

	let { dropHandler }: Props = $props();

	function ondragover(event: DragEvent) {
		event.preventDefault() // Prevent default to allow drop
	}

	function ondrop(event: DragEvent) {
		event.preventDefault()

		// Get the dragged data
		const data = event.dataTransfer?.getData('text/plain')
		if (!data) {
			return
		}

		if (dropHandler) {
			dropHandler(data)
		}
	}
</script>

<div
	role="region"
	class="drop-area p-[20px] text-center min-h-[20rem]"
	style="border: 2px dashed #ccc;"
	{ondragover}
	{ondrop}
>
	Drop a URL here
</div>
