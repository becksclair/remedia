import { type EventCallback, listen } from "@tauri-apps/api/event"
import { useEffect } from "react"

export type MediaProgressEvent = [number, number]
export type MediaInfoEvent = [number, string, string]

let tauriEventHandlers: Record<string, unknown> = {}

/**
 * A custom hook to easily set up multiple Tauri event listeners at once.
 *
 * @param eventHandlers - An object mapping event names to their handler functions
 */
function useTauriEvents(eventHandlers: Record<string, unknown>) {
	tauriEventHandlers = eventHandlers

	useEffect(() => {
		const unlistenFunctions: Array<() => void> = []

		// Set up all listeners
		const setupListeners = async () => {
			for (const [eventName, handler] of Object.entries(tauriEventHandlers)) {
				try {
					const unlistenFn = await listen(eventName, handler as EventCallback<unknown>)
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
