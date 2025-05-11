import { type Event, listen } from "@tauri-apps/api/event"
import { useEffect, useRef } from "react"

export type MediaProgressEvent = [number, number]
export type MediaInfoEvent = [number, string, string]

export type HandlerFuncType<T = unknown> = (event: Event<T>) => void

/**
 * A custom hook to easily set up multiple Tauri event listeners at once.
 *
 * @param eventHandlers - An object mapping event names to their handler functions
 */
function useTauriEvents<T = unknown>(eventHandlers: Record<string, HandlerFuncType<T>>) {
	useEffect(() => {
		const unlistenFunctions: Array<() => void> = []

		// Set up all listeners
		const setupListeners = async () => {
			for (const [eventName, handler] of Object.entries(eventHandlers)) {
				try {
					const unlistenFn = await listen(eventName, handler)
					unlistenFunctions.push(unlistenFn)
					console.log(`Registered listener for ${eventName}`)
				} catch (error) {
					console.error(`Failed to listen to Tauri event '${eventName}':`, error)
				}
			}
		}

		void setupListeners()

		// Cleanup function to remove all listeners
		return () => {
			unlistenFunctions.forEach(unlisten => unlisten())
			console.log("Removed all Tauri event listeners")
		}
	}, [])
}

export { useTauriEvents }
