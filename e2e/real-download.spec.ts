import { test } from "@playwright/test";

const REAL_DL = process.env.PLAYWRIGHT_REAL_DL === "1";
const REMOTE_WS_URL = process.env.REMEDIA_WS_URL || "ws://127.0.0.1:17814";
const REAL_URL_PRIMARY =
  process.env.PLAYWRIGHT_REAL_URL ?? "https://www.youtube.com/watch?v=BaW_jenozKc";
const REAL_URL_SECONDARY =
  process.env.PLAYWRIGHT_REAL_URL_ALT ?? "https://www.youtube.com/watch?v=2Z4m4lnjxkY";

async function runRemoteDownloadScenario(page: import("@playwright/test").Page, url: string) {
  await page.evaluate(
    async ({ wsUrl, downloadUrl, timeoutMs }) => {
      function sleep(ms: number): Promise<void> {
        return new Promise((resolve) => setTimeout(resolve, ms));
      }

      function parseJson(text: string): unknown {
        try {
          return JSON.parse(text);
        } catch {
          return null;
        }
      }

      const events: unknown[] = [];
      const ws = new WebSocket(wsUrl);

      await new Promise<void>((resolve, reject) => {
        ws.onopen = () => resolve();
        ws.onerror = (err) => reject(err);
      });

      ws.onmessage = (ev) => {
        const text = String(ev.data);
        const parsed = parseJson(text);
        if (parsed) events.push(parsed);
      };

      const send = (obj: unknown) => {
        ws.send(JSON.stringify(obj));
      };

      // Reset state and kick off a real download via remote harness.
      send({ action: "clearList" });
      send({ action: "addUrl", url: downloadUrl });
      send({ action: "startDownloads" });
      send({ action: "status" });

      async function waitFor(
        predicate: (m: unknown) => boolean,
        label: string,
        timeout: number,
      ): Promise<unknown> {
        const start = Date.now();
        // eslint-disable-next-line no-constant-condition
        while (true) {
          const found = events.find(predicate);
          if (found) return found;
          if (Date.now() - start > timeout) {
            throw new Error(`timeout waiting for ${label}`);
          }
          // eslint-disable-next-line no-await-in-loop
          await sleep(250);
        }
      }

      // Ensure the download actually starts (progress or error).
      const first = await waitFor(
        (m) =>
          typeof m === "object" &&
          m !== null &&
          ["download-progress", "download-error"].includes(
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (m as any).event as string,
          ),
        "download-progress or download-error",
        timeoutMs,
      );

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if ((first as any).event === "download-error") {
        throw new Error(`download-error received: ${JSON.stringify(first)}`);
      }

      // Wait for a progress event with non-zero percentage.
      await waitFor(
        (m) => {
          if (typeof m !== "object" || m === null) return false;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const ev = (m as any).event;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const payload = (m as any).payload;
          return ev === "download-progress" && Array.isArray(payload) && Number(payload[1]) > 0.1;
        },
        "download-progress > 0",
        timeoutMs,
      );

      // Finally wait for download-complete event.
      await waitFor(
        (m) =>
          typeof m === "object" &&
          m !== null &&
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (m as any).event === "download-complete",
        "download-complete",
        timeoutMs,
      );

      ws.close();
    },
    { wsUrl: REMOTE_WS_URL, downloadUrl: url, timeoutMs: 180000 },
  );
}

async function runRemoteCancelScenario(
  page: import("@playwright/test").Page,
  primaryUrl: string,
  secondaryUrl: string,
) {
  await page.evaluate(
    async ({ wsUrl, primaryUrl, secondaryUrl, timeoutMs }) => {
      function sleep(ms: number): Promise<void> {
        return new Promise((resolve) => setTimeout(resolve, ms));
      }

      function parseJson(text: string): unknown {
        try {
          return JSON.parse(text);
        } catch {
          return null;
        }
      }

      const events: unknown[] = [];
      const ws = new WebSocket(wsUrl);

      await new Promise<void>((resolve, reject) => {
        ws.onopen = () => resolve();
        ws.onerror = (err) => reject(err);
      });

      ws.onmessage = (ev) => {
        const text = String(ev.data);
        const parsed = parseJson(text);
        if (parsed) events.push(parsed);
      };

      const send = (obj: unknown) => {
        ws.send(JSON.stringify(obj));
      };

      // Reset state and start two downloads via remote harness.
      send({ action: "clearList" });
      send({ action: "addUrl", url: primaryUrl });
      send({ action: "addUrl", url: secondaryUrl });
      send({ action: "startDownloads" });

      async function waitFor(
        predicate: (m: unknown) => boolean,
        label: string,
        timeout: number,
      ): Promise<unknown> {
        const start = Date.now();
        // eslint-disable-next-line no-constant-condition
        while (true) {
          const found = events.find(predicate);
          if (found) return found;
          if (Date.now() - start > timeout) {
            throw new Error(`timeout waiting for ${label}`);
          }
          // eslint-disable-next-line no-await-in-loop
          await sleep(250);
        }
      }

      // Wait until we see some progress to confirm downloads are active.
      await waitFor(
        (m) => {
          if (typeof m !== "object" || m === null) return false;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const ev = (m as any).event;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const payload = (m as any).payload;
          return ev === "download-progress" && Array.isArray(payload) && Number(payload[1]) > 0.1;
        },
        "download-progress before cancelAll",
        timeoutMs,
      );

      // Issue cancelAll via remote harness.
      send({ action: "cancelAll" });

      // Wait for a successful cancelAll acknowledgement from remote control.
      await waitFor(
        (m) => {
          if (typeof m !== "object" || m === null) return false;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const anyM = m as any;
          return anyM.ok === true && anyM.action === "cancelAll";
        },
        "cancelAll acknowledgement",
        timeoutMs,
      );

      ws.close();
    },
    {
      wsUrl: REMOTE_WS_URL,
      primaryUrl,
      secondaryUrl,
      timeoutMs: 180000,
    },
  );
}

async function clearAllBestEffort(page: import("@playwright/test").Page) {
  try {
    const rows = page.getByRole("row").filter({ hasNotText: "Select all" });
    if ((await rows.count()) === 0) return;
    const firstRow = rows.first();
    await firstRow.click({ button: "right" });
    await page.getByRole("menuitem", { name: "Clear All" }).click({ timeout: 10000 });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.warn("[real-download] clearAll failed (ignored)", error);
  }
}

test.describe("Real download smoke", () => {
  test.skip(!REAL_DL, "Set PLAYWRIGHT_REAL_DL=1 to enable real download smoke tests.");
  test.describe.configure({ timeout: 240000 });

  test("completes a single real download", async ({ page, browserName }) => {
    test.skip(browserName === "webkit", "Real downloads not validated on WebKit yet.");
    await page.goto("/");

    await runRemoteDownloadScenario(page, REAL_URL_PRIMARY);

    await clearAllBestEffort(page);
  });

  test("cancel all halts active real downloads", async ({ page, browserName }) => {
    test.skip(browserName === "webkit", "Real downloads not validated on WebKit yet.");
    await page.goto("/");

    await runRemoteCancelScenario(page, REAL_URL_PRIMARY, REAL_URL_SECONDARY);

    await clearAllBestEffort(page);
  });
});
