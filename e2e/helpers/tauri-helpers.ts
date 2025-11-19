import type { Page } from "@playwright/test";

type E2EWindow = Window & { __E2E_lastEventReceived?: string };

/**
 * Waits for a Tauri event to be received during E2E testing
 * @param page - Playwright page instance
 * @param eventName - Name of the Tauri event to wait for
 * @param timeout - Timeout in milliseconds (default: 5000)
 * @returns Promise that resolves when event is received
 */
export const waitForTauriEvent = async (
  page: Page,
  eventName: string,
  timeout = 5000,
) => {
  if (!eventName.trim()) {
    throw new Error("Event name cannot be empty");
  }

  return page.waitForFunction(
    ({ eventName }) => {
      const e2eWindow = window as E2EWindow;
      return e2eWindow.__E2E_lastEventReceived === eventName;
    },
    { eventName },
    { timeout },
  );
};
