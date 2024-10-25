<script lang="ts">
	import { cn } from '$lib/utils.js'

	interface Props {
		klass?: string
		children?: import('svelte').Snippet
	}

	let { klass = '', children }: Props = $props()
</script>

<p class={cn('py-3 text-sm font-medium leading-none', klass)}>
	{@render children?.()}
</p>
