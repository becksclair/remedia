<script lang="ts">
    import { ModeWatcher } from "mode-watcher";
    import "../app.css";
    interface Props {
        children?: import('svelte').Snippet;
    }

    let { children }: Props = $props();
</script>

<ModeWatcher />
{@render children?.()}
