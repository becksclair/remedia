import { type Event, listen } from "@tauri-apps/api/event"
import { useEffect, useRef } from "react"

export type MediaProgressEvent = [number, number]
export type MediaInfoEvent = [number, string, string]

export type HandlerFuncType<T = unknown> = (event: Event<T>) => void

/**
 * A generic custom hook that listens to Tauri events.
 *
 * @param eventName - The name of the event to listen to.
 * @param handler - The function to call when the event is emitted.
 */
function useTauriEvent<T = unknown>(eventName: string, handler: HandlerFuncType<T>) {
	// Track the handler in a ref to always have the latest version without retriggering effects
	const handlerRef = useRef<HandlerFuncType<T>>(handler)

	// Always update the ref to point to the latest handler
	useEffect(() => {
		handlerRef.current = handler
	}, [handler])

	useEffect(() => {
		// Safety check for empty event name
		if (!eventName) {
			console.error("useTauriEvent: Missing event name")
			return () => {}
		}

		let unlistenFn: (() => void) | undefined

		const setupListener = async () => {
			try {
				// Create an event listener that uses the ref to always call the most recent handler
				const eventListener = (event: Event<T>) => {
					handlerRef.current(event)
				}

				// Set up the listener and store the unlisten function
				unlistenFn = await listen<T>(eventName, eventListener)
				console.log(`Successfully registered listener for ${eventName}`)
			} catch (error) {
				console.error(`Failed to listen to Tauri event '${eventName}':`, error)
			}
		}

		// Start the listener immediately
		void setupListener()

		// Cleanup function to remove the listener when component unmounts or event name changes
		return () => {
			if (unlistenFn) {
				unlistenFn()
				console.log(`Removed listener for ${eventName}`)
			}
		}
	}, [eventName]) // Only re-run if eventName changes
}

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
	}, [eventHandlers]) // This dependency will cause issues if object identity changes
}

export { useTauriEvent, useTauriEvents }
