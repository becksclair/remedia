<script lang="ts">
	import { cn } from '$lib/utils.js'

	interface Props {
		klass?: string;
		children?: import('svelte').Snippet;
	}

	let { klass = '', children }: Props = $props();
</script>

<p class={cn('text-sm font-medium leading-none py-3', klass)}>
	{@render children?.()}
</p>
