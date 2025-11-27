import type * as React from "react";
import { cn } from "@/lib/utils";

type Props = {
  dropHandler: (url: string) => void;
  dragHovering: boolean;
};

function DropZone({
  className,
  dropHandler,
  dragHovering,
}: React.ComponentProps<"div"> & Props) {
  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();

    const url =
      event.dataTransfer.getData("text/uri-list") ||
      event.dataTransfer.getData("text/plain");
    if (url) {
      console.log(
        "URL Dropped into drop zone, calling top level handler now",
        url,
      );
      dropHandler(url);
    } else {
      console.log("No URL found in drag event.");
    }
  };

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: This is a drop zone for drag-and-drop
    <div
      data-testid="drop-zone"
      className={cn(
        "drop-zone text-center text-2xl text-foreground font-medium",
        dragHovering && "hover",
        className,
      )}
      onDrop={handleDrop}
    >
      {dragHovering ? "Drop your link here" : "Drag and drop media links here"}
    </div>
  );
}

export { DropZone };
