import { type EventCallback, listen } from "@tauri-apps/api/event";
import { useEffect } from "react";

export type MediaProgressEvent = [number, number];
export type MediaInfoEvent = [number, string, string, string];

let tauriEventHandlers: Record<string, unknown> = {};

// Expose a minimal test helper to emit events during Playwright tests
// This is safe in production; it only runs in the browser and does nothing unless called
declare global {
	interface Window {
		__E2E_emitTauriEvent?: (eventName: string, payload: unknown) => void;
	}
}
if (typeof window !== "undefined") {
	window.__E2E_emitTauriEvent = (eventName: string, payload: unknown) => {
		const handler = tauriEventHandlers[eventName] as EventCallback<unknown> | undefined;
		if (typeof handler === "function") {
			// Pass an object shaped like Tauri's Event<T>
			// @ts-expect-error Minimal shape for tests
			handler({ payload });
		}
	};
}

/**
 * A custom hook to easily set up multiple Tauri event listeners at once.
 *
 * @param eventHandlers - An object mapping event names to their handler functions
 */
function useTauriEvents(eventHandlers: Record<string, unknown>) {
	tauriEventHandlers = eventHandlers;

	useEffect(() => {
		const unlistenFunctions: Array<() => void> = [];

		// Set up all listeners
		const setupListeners = async () => {
			for (const [eventName, handler] of Object.entries(tauriEventHandlers)) {
				try {
					const unlistenFn = await listen(eventName, handler as EventCallback<unknown>);
					unlistenFunctions.push(unlistenFn);
					console.log(`Registered listener for ${eventName}`);
				} catch (error) {
					console.error(`Failed to listen to Tauri event '${eventName}':`, error);
				}
			}
		};

		void setupListeners();

		// Cleanup function to remove all listeners
		return () => {
			unlistenFunctions.forEach(unlisten => unlisten());
			console.log("Removed all Tauri event listeners");
		};
	}, []);
}

export { useTauriEvents };
