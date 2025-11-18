import { type EventCallback } from "@tauri-apps/api/event";
import { useEffect } from "react";
import { useTauriApi } from "@/lib/TauriApiContext";

let tauriEventHandlers: Record<string, unknown> = {};
type PendingEvent = { eventName: string; payload: unknown };
const pendingEvents: PendingEvent[] = [];

function tryDeliverEvent(eventName: string, payload: unknown): boolean {
	const handler = tauriEventHandlers[eventName] as EventCallback<unknown> | undefined;
	if (typeof handler === "function") {
		handler({
			event: eventName,
			id: Date.now(),
			payload,
			windowLabel: "main"
		} as unknown as Parameters<EventCallback<unknown>>[0]);
		return true;
	}
	return false;
}

// Expose a minimal test helper to emit events during Playwright tests
// This is safe in production; it only runs in the browser and does nothing unless called
declare global {
	interface Window {
		__E2E_emitTauriEvent?: (eventName: string, payload: unknown) => void;
		__E2E_TESTS__?: boolean;
	}
}

// Always expose an event injection helper. It is a no-op unless tests call it
// and relevant handlers have been registered via useTauriEvents.
if (typeof window !== "undefined") {
	window.__E2E_emitTauriEvent = (eventName: string, payload: unknown) => {
		const delivered = tryDeliverEvent(eventName, payload);
		if (!delivered) pendingEvents.push({ eventName, payload });
	};
}

/**
 * A custom hook to easily set up multiple Tauri event listeners at once.
 *
 * @param eventHandlers - An object mapping event names to their handler functions
 */
function useTauriEvents(eventHandlers: Record<string, unknown>) {
	tauriEventHandlers = eventHandlers;
	const tauriApi = useTauriApi();

	useEffect(() => {
		const unlistenFunctions: Array<() => void> = [];

		// Set up all listeners
		const setupListeners = async () => {
			for (const [eventName, handler] of Object.entries(tauriEventHandlers)) {
				try {
					const unlistenFn = await tauriApi.events.listen(eventName, handler as EventCallback<unknown>);
					unlistenFunctions.push(unlistenFn);
					console.log(`Registered listener for ${eventName}`);
				} catch (error) {
					console.error(`Failed to listen to Tauri event '${eventName}':`, error);
				}
			}

			// Flush any pending injected events from tests
			if (pendingEvents.length > 0) {
				const toProcess = pendingEvents.splice(0, pendingEvents.length);
				for (const { eventName, payload } of toProcess) {
					tryDeliverEvent(eventName, payload);
				}
			}
		};

		void setupListeners();

		// Cleanup function to remove all listeners
		return () => {
			unlistenFunctions.forEach(unlisten => unlisten());
			console.log("Removed all Tauri event listeners");
		};
	}, [tauriApi]);
}

export { useTauriEvents };
