<script lang="ts">
    import { cn } from "$lib/utils.js";

    export let className = "";
</script>

<p class={cn("text-sm font-medium leading-none py-3", className)}>
    Select the location where you want to save the downloaded files:
    <slot />
</p>
