<script lang="ts">
    export let dropHandler: (url: string) => void;

    function handleDragOver(event: DragEvent) {
        event.preventDefault(); // Prevent default to allow drop
    }

    function handleDrop(event: DragEvent) {
        event.preventDefault();

        // Get the dragged data
        const data = event.dataTransfer?.getData("text/plain");
        if (!data) {
            return;
        }

        if (dropHandler) {
            dropHandler(data);
        }
    }
</script>

<div
    role="region"
    on:dragover={handleDragOver}
    on:drop={handleDrop}
    class="drop-area p-[20px] text-center"
    style="border: 2px dashed #ccc;"
>
    Drop a URL here
</div>
