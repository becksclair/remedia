import type * as React from "react"
import { useState } from "react"
import { cn } from "@/lib/utils"

type Props = {
	dropHandler: (url: string) => void
	dragHovering: boolean
}

function DropZone({ className, dropHandler, dragHovering }: React.ComponentProps<"button"> & Props) {
	const [isFocused, setIsFocused] = useState(false)

	const handleDrop = (event: React.DragEvent<HTMLButtonElement>) => {
		event.preventDefault()

		const url = event.dataTransfer.getData("text/uri-list") || event.dataTransfer.getData("text/plain")
		if (url) {
			console.log("URL Dropped into drop zone, calling top level handler now", url)
			dropHandler(url)
		} else {
			console.log("No URL found in drag event.")
		}
	}

	const handleKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
		// Handle paste operation with Ctrl+V or Cmd+V
		if ((event.ctrlKey || event.metaKey) && event.key === "v") {
			event.preventDefault()

			// Use the Clipboard API to read text
			navigator.clipboard
				.readText()
				.then(text => {
					if (text && /^https?:\/\//.test(text)) {
						console.log("URL pasted into drop zone:", text)
						dropHandler(text)
					}
				})
				.catch(err => {
					console.error("Failed to read clipboard:", err)
				})
		}

		// Handle Enter or Space key to trigger paste
		if (event.key === "Enter" || event.key === " ") {
			event.preventDefault()

			navigator.clipboard
				.readText()
				.then(text => {
					if (text && /^https?:\/\//.test(text)) {
						console.log("URL pasted into drop zone via keyboard:", text)
						dropHandler(text)
					}
				})
				.catch(err => {
					console.error("Failed to read clipboard:", err)
				})
		}
	}

	const handleFocus = () => {
		setIsFocused(true)
	}

	const handleBlur = () => {
		setIsFocused(false)
	}

	return (
		<button
			type="button"
			aria-label="Media URL drop zone - drag and drop media links or press Enter/Space to paste from clipboard"
			aria-describedby="drop-zone-instructions"
			className={cn(
				`min-h-[18rem] p-[4rem] text-center text-2xl drop-zone transition-colors border-none bg-transparent w-full ${dragHovering ? "hover" : ""} ${isFocused ? "ring-2 ring-blue-500 ring-offset-2" : ""}`,
				className
			)}
			onDrop={handleDrop}
			onKeyDown={handleKeyDown}
			onFocus={handleFocus}
			onBlur={handleBlur}>
			<div id="drop-zone-instructions" className="sr-only">
				Drop media links here or press Enter or Space to paste from clipboard. Supports keyboard navigation with
				Tab key.
			</div>
			{dragHovering ? "Drop your link here" : "Drag and drop media links here"}
			{isFocused && (
				<div className="mt-2 text-sm text-gray-600">
					Press Enter or Space to paste from clipboard, or Ctrl+V/Cmd+V
				</div>
			)}
		</button>
	)
}

export { DropZone }
