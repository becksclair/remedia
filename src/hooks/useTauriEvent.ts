import type { Event, EventCallback } from "@tauri-apps/api/event";
import { useEffect, useRef } from "react";
import { useSetAtom } from "jotai";
import { useTauriApi } from "@/lib/TauriApiContext";
import type { TauriEventName, TauriEventPayloadMap } from "@/types";
import { addLogEntryAtom } from "@/state/app-atoms";

// Registry of all active hook instances, keyed by instance ID
const handlerRegistry = new Map<number, Record<string, unknown>>();
let nextInstanceId = 1;

type PendingEvent = { eventName: string; payload: unknown };
const pendingEvents: PendingEvent[] = [];

function tryDeliverEvent(eventName: string, payload: unknown): boolean {
  // Try to deliver to all registered instances that have a handler for this event
  let delivered = false;
  for (const handlers of handlerRegistry.values()) {
    const handler = handlers[eventName] as EventCallback<unknown> | undefined;
    if (typeof handler === "function") {
      handler({
        event: eventName,
        id: Date.now(),
        payload,
        windowLabel: "main",
      } as unknown as Parameters<EventCallback<unknown>>[0]);
      delivered = true;
    }
  }
  return delivered;
}

// Expose a minimal test helper to emit events during Playwright tests
// This is safe in production; it only runs in the browser and does nothing unless called
declare global {
  interface Window {
    __E2E_emitTauriEvent?: (eventName: string, payload: unknown) => void;
    __E2E_TESTS__?: boolean;
  }
}

type TauriEventHandlers<E extends TauriEventName = TauriEventName> = {
  [K in E]?: (event: Event<TauriEventPayloadMap[K]>) => void;
};

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
function useTauriEvents<E extends TauriEventName>(eventHandlers: TauriEventHandlers<E>) {
  const tauriApi = useTauriApi();
  const addLogEntry = useSetAtom(addLogEntryAtom);
  const instanceIdRef = useRef<number | null>(null);

  useEffect(() => {
    // Generate a unique instance ID and register handlers
    const instanceId = nextInstanceId++;
    instanceIdRef.current = instanceId;
    handlerRegistry.set(instanceId, eventHandlers as Record<string, unknown>);

    const unlistenFunctions: Array<() => void> = [];

    // Set up all listeners
    const setupListeners = async () => {
      for (const [eventName, handler] of Object.entries(eventHandlers)) {
        try {
          const unlistenFn = await tauriApi.events.listen(
            eventName,
            handler as EventCallback<unknown>,
          );
          unlistenFunctions.push(unlistenFn);
          const isTestEnvironment =
            typeof window !== "undefined" &&
            (window.__E2E_TESTS__ || process.env.NODE_ENV === "test");
          if (!isTestEnvironment) {
            const message = `Registered listener for ${eventName}`;
            console.log(message);
            addLogEntry({
              timestamp: Date.now(),
              source: "app",
              level: "info",
              message,
            });
          }
        } catch (error) {
          console.error(`Failed to listen to Tauri event '${eventName}':`, error);
        }
      }

      // Flush any pending injected events from tests
      if (pendingEvents.length > 0) {
        const toProcess = pendingEvents.splice(0, pendingEvents.length);
        for (const { eventName, payload } of toProcess) {
          try {
            const delivered = tryDeliverEvent(eventName, payload);
            if (!delivered) {
              console.warn(`Pending Tauri event '${eventName}' not delivered to any handler`, {
                payload,
              });
            }
          } catch (error) {
            console.error(`Error delivering pending Tauri event '${eventName}'`, {
              payload,
              error,
            });
          }
        }
      }
    };

    void setupListeners();

    // Cleanup function to remove all listeners and unregister handlers
    return () => {
      unlistenFunctions.forEach((unlisten) => unlisten());
      if (instanceIdRef.current !== null) {
        handlerRegistry.delete(instanceIdRef.current);
      }
      const isTestEnvironment =
        typeof window !== "undefined" && (window.__E2E_TESTS__ || process.env.NODE_ENV === "test");
      if (!isTestEnvironment) {
        const message = "Removed all Tauri event listeners";
        console.log(message);
        addLogEntry({
          timestamp: Date.now(),
          source: "app",
          level: "info",
          message,
        });
      }
    };
  }, [tauriApi, eventHandlers, addLogEntry]);
}

export { useTauriEvents };
