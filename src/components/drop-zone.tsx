import type * as React from "react";
import { useState } from "react";
import { cn } from "@/lib/utils";

type Props = {
	dropHandler: (url: string) => void;
}

function DropZone({
	className,
	dropHandler
}: React.ComponentProps<"section"> & Props) {
	const [dragHovering, setDragHovering] = useState(false);

	const handleDragOver = (event: React.DragEvent<HTMLDivElement>) => {
		event.preventDefault();
		setDragHovering(true);
	};

	const handleDragLeave = () => {
		setDragHovering(false);
	};

	const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
		event.preventDefault();
		setDragHovering(false);

		const url = event.dataTransfer.getData("text/uri-list") || event.dataTransfer.getData("text/plain");
		if (url) {
			console.log("Dragged URL:", url);
			dropHandler(url);
		} else {
			console.log("No URL found in drag event.");
		}
	};

	return (
		<section
			className={cn(`min-h-[18rem] p-[4rem] text-center text-2xl drop-zone ${dragHovering ? "hover" : ""}`, className)}
			onDragOver={handleDragOver}
			onDragLeave={handleDragLeave}
			onDrop={handleDrop}
		>
			{dragHovering ? "Drop your link here" : "Drag and drop media links here"}
			{/* Drop your link here */}
		</section>
	);
}

export { DropZone };
