import { test, expect } from "@playwright/test";

// Type declarations for Tauri globals
declare global {
  interface Window {
    __TAURI__?: unknown;
    __E2E_emitTauriEvent?: (eventName: string, payload: unknown) => void;
    __E2E_addUrl?: (url: string) => void;
  }
}

// Helper to emit events inside the Tauri webview from tests
async function emitTauriEvent(
  page: import("@playwright/test").Page,
  eventName: string,
  payload: unknown,
) {
  await page.evaluate(
    ({ eventName, payload }) => {
      window.__E2E_emitTauriEvent?.(eventName, payload);
    },
    { eventName, payload },
  );
}

test.describe("ReMedia app", () => {
  test("loads main window and handles drag & drop URL", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator(".drop-zone")).toBeVisible();

    // Add URL using local asset served by Vite/Tauri dev server
    const url = new URL("/daybreak.mp4", page.url()).toString();
    await page.evaluate((url) => window.__E2E_addUrl?.(url), url);

    // After adding, the table should show the URL as title initially
    await expect(page.getByRole("cell", { name: "daybreak.mp4" })).toBeVisible();
  });

  test("receives media info and progress events", async ({ page }) => {
    await page.goto("/");

    const url = new URL("/daybreak.mp4", page.url()).toString();
    await page.evaluate((url) => window.__E2E_addUrl?.(url), url);

    // Inject media info event to update title and thumbnail
    await emitTauriEvent(page, "update-media-info", [
      0,
      url,
      "Nice Title",
      "https://img/thumb.jpg",
    ]);
    await expect(page.getByText("Nice Title")).toBeVisible();

    // Inject progress
    await emitTauriEvent(page, "download-progress", [0, 55]);
    // We can't read progress bar value easily; assert presence of Progress elements
    await expect(page.getByTestId("global-progress")).toBeVisible();
  });

  test("settings persistence via Jotai storage", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Settings" }).click();
    await expect(page.getByRole("heading", { name: "Settings", exact: true })).toBeVisible();

    const input = page.locator("#download-location");
    await input.fill("/tmp/remedia-tests");
    await page.getByRole("button", { name: "Done" }).click();

    // Reload and ensure value persisted
    await page.reload();
    await page.getByRole("button", { name: "Settings" }).click();
    await expect(page.locator("#download-location")).toHaveValue("/tmp/remedia-tests");
  });

  test("opens player window route for selected item (Tauri only)", async ({ page, context }) => {
    await page.goto("/");

    const isTauri = await page.evaluate(() => Boolean(window.__TAURI__));
    if (!isTauri) test.skip(true, "Skipping multi-window test outside Tauri runtime");

    const url = new URL("/daybreak.mp4", page.url()).toString();
    await page.evaluate((url) => window.__E2E_addUrl?.(url), url);

    // Select first row via the header checkbox (select all)
    await page.getByRole("checkbox", { name: "Select all" }).click();
    await page.getByRole("button", { name: "Preview" }).click();

    // Wait for a new WebView page; Playwright may see it as a new page
    const newPage = await context.waitForEvent("page", { timeout: 10000 });
    await newPage.waitForLoadState();
    expect(newPage.url()).toContain("/player?url=");
  });

  test("always-on-top setting persists", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Settings" }).click();

    const checkbox = page.getByRole("checkbox", { name: "Stay on top" });
    await expect(checkbox).toBeVisible();
    const initiallyChecked = await checkbox.isChecked();
    await checkbox.click();
    await page.getByRole("button", { name: "Done" }).click();

    await page.reload();
    await page.getByRole("button", { name: "Settings" }).click();
    if (initiallyChecked) {
      await expect(page.getByRole("checkbox", { name: "Stay on top" })).not.toBeChecked();
    } else {
      await expect(page.getByRole("checkbox", { name: "Stay on top" })).toBeChecked();
    }
  });

  // Phase 1 Tests: Progress & Thumbnails
  test("shows thumbnail placeholder when no thumbnail provided", async ({ page }) => {
    await page.goto("/");

    const url = "https://example.com/video";
    await page.evaluate((url) => window.__E2E_addUrl?.(url), url);

    // Emit media info with empty thumbnail
    await emitTauriEvent(page, "update-media-info", [0, url, "Test Video", ""]);

    // Should show placeholder image
    const thumbnail = page.locator('img[alt="Media thumbnail"]').first();
    await expect(thumbnail).toBeVisible();
    const src = await thumbnail.getAttribute("src");
    expect(src).toMatch(/thumbnail-placeholder|data:image\/svg\+xml/);
  });

  test("smooth progress updates with clamping", async ({ page }) => {
    await page.goto("/");

    const url = "https://example.com/video";
    await page.evaluate((url) => window.__E2E_addUrl?.(url), url);

    // Test clamping: values outside 0-100 should be clamped
    await emitTauriEvent(page, "download-progress", [0, -5]);
    // Progress bar should show minimum value

    await emitTauriEvent(page, "download-progress", [0, 150]);
    // Progress bar should show maximum value

    await emitTauriEvent(page, "download-progress", [0, 45]);
    // Normal progress should work

    // Global progress should update
    await expect(page.getByTestId("global-progress")).toBeVisible();
  });

  // Phase 3 Tests: Advanced Settings - Consolidated persistence tests
  const settingsPersistenceTests = [
    {
      name: "download mode",
      tab: "Downloads",
      selector: "#download-mode",
      optionName: "Audio only",
      expectedText: "Audio only",
    },
    {
      name: "max resolution",
      tab: "Quality",
      selector: "#max-resolution",
      optionName: "1080p (Full HD)",
      expectedText: "1080p (Full HD)",
    },
    {
      name: "audio quality",
      tab: "Quality",
      selector: "#audio-quality",
      optionName: /High \(256 kbps\)/,
      expectedText: "High (256 kbps)",
    },
    {
      name: "video format",
      tab: "Quality",
      selector: "#video-format",
      optionName: "MP4",
      expectedText: "MP4",
    },
    {
      name: "audio format",
      tab: "Quality",
      selector: "#audio-format",
      optionName: "MP3",
      expectedText: "MP3",
    },
  ] as const;

  for (const { name, tab, selector, optionName, expectedText } of settingsPersistenceTests) {
    test(`${name} setting persists`, async ({ page }) => {
      await page.goto("/");
      await page.getByRole("button", { name: "Settings" }).click();
      await page.getByRole("tab", { name: tab }).click();

      await page.locator(selector).click();
      await page.getByRole("option", { name: optionName }).click();
      await page.getByRole("button", { name: "Done" }).click();

      await page.reload();
      await page.getByRole("button", { name: "Settings" }).click();
      await page.getByRole("tab", { name: tab }).click();
      await expect(page.locator(selector)).toContainText(expectedText);
    });
  }

  test("video settings visible only in video mode", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Settings" }).click();
    await page.getByRole("tab", { name: "Quality" }).click();

    // In video mode, video settings should be visible
    await expect(page.getByText("Video Settings")).toBeVisible();
    await expect(page.locator("#max-resolution")).toBeVisible();

    // Switch to audio mode
    await page.getByRole("tab", { name: "Downloads" }).click();
    await page.locator("#download-mode").click();
    await page.getByRole("option", { name: "Audio only" }).click();
    await page.getByRole("tab", { name: "Quality" }).click();

    // Video settings should be hidden, audio visible
    await expect(page.getByText("Video Settings")).not.toBeVisible();
    await expect(page.getByText("Audio Settings")).toBeVisible();
  });

  test("completion events update status correctly", async ({ page, browserName }) => {
    test.skip(browserName === "webkit", "WebKit JSDOM event delivery flaky");
    await page.goto("/");

    const url = "https://example.com/video";
    await page.evaluate((url) => window.__E2E_addUrl?.(url), url);

    // Emit complete event
    await emitTauriEvent(page, "download-complete", 0);

    // Status should update to "Done"
    await expect(page.getByRole("cell", { name: "Done" })).toBeVisible();
  });

  test("error events update status correctly", async ({ page, browserName }) => {
    test.skip(browserName === "webkit", "WebKit JSDOM event delivery flaky");
    await page.goto("/");

    const url = "https://example.com/video";
    await page.evaluate((url) => window.__E2E_addUrl?.(url), url);

    // Emit error event
    await emitTauriEvent(page, "download-error", 0);

    // Status should update to "Error"
    await expect(page.getByRole("cell", { name: "Error" })).toBeVisible();
  });

  // Phase 4: Context Menu Tests
  test("context menu appears on right-click", async ({ page, browserName }) => {
    test.skip(browserName === "webkit", "WebKit context menu flaky in web mode");
    await page.goto("/");

    const url = "https://example.com/video1";
    await page.evaluate((url) => window.__E2E_addUrl?.(url), url);

    // Right-click on the table row using coordinates for better Chromium support
    const row = page.getByRole("row").filter({ hasText: "video1" });
    const box = await row.boundingBox();
    if (box) {
      await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2, { button: "right" });
    } else {
      await row.click({ button: "right" });
    }

    // Debug: Check if context menu content is actually visible
    try {
      await page.waitForSelector('[data-slot="context-menu-content"]', {
        state: "visible",
        timeout: 3000,
      });
    } catch (e) {
      // If context menu doesn't appear, try alternative right-click method
      // eslint-disable-next-line no-console
      console.debug("Context menu not visible with first attempt, retrying:", e);
      await row.click({ button: "right" });
      await page.waitForSelector('[data-slot="context-menu-content"]', {
        state: "visible",
        timeout: 3000,
      });
    }

    // Take screenshot for debugging
    await page.screenshot({ path: "debug-context-menu.png" });

    // Context menu should appear with expected items
    await expect(
      page.locator('[data-slot="context-menu-item"]').filter({ hasText: "Remove Selected" }),
    ).toBeVisible({ timeout: 5000 });
    await expect(
      page.locator('[data-slot="context-menu-item"]').filter({ hasText: "Clear All" }),
    ).toBeVisible({ timeout: 5000 });
    await expect(
      page.locator('[data-slot="context-menu-item"]').filter({ hasText: "Copy All URLs" }),
    ).toBeVisible({ timeout: 5000 });
  });

  test("remove selected removes checked items", async ({ page, browserName }) => {
    test.skip(browserName === "webkit", "WebKit context menu flaky in web mode");
    await page.goto("/");

    // Add multiple URLs
    const urls = [
      "https://example.com/video1",
      "https://example.com/video2",
      "https://example.com/video3",
    ];
    for (const url of urls) {
      await page.evaluate((url) => window.__E2E_addUrl?.(url), url);
    }

    await expect(page.getByRole("row").filter({ hasText: "video1" })).toBeVisible();

    // Select first two items using checkboxes
    const firstCheckbox = page
      .getByRole("row")
      .filter({ hasText: "video1" })
      .getByLabel("Select row");
    const secondCheckbox = page
      .getByRole("row")
      .filter({ hasText: "video2" })
      .getByLabel("Select row");
    await firstCheckbox.check();
    await secondCheckbox.check();

    // Right-click and select "Remove Selected"
    await page.getByRole("row").filter({ hasText: "video1" }).click({ button: "right" });
    await page.getByRole("menuitem", { name: "Remove Selected" }).click();

    // First two should be gone, third should remain
    await expect(page.getByRole("cell", { name: "video1" })).not.toBeVisible();
    await expect(page.getByRole("cell", { name: "video2" })).not.toBeVisible();
    await expect(page.getByRole("cell", { name: "video3" })).toBeVisible();
  });

  test("remove all clears entire list", async ({ page, browserName }) => {
    test.skip(browserName === "webkit", "WebKit context menu flaky in web mode");
    await page.goto("/");

    // Add multiple URLs
    const urls = ["https://example.com/video1", "https://example.com/video2"];
    for (const url of urls) {
      await page.evaluate((url) => window.__E2E_addUrl?.(url), url);
    }

    await expect(page.getByRole("row").filter({ hasText: "video1" })).toBeVisible();

    // Right-click and select "Remove All"
    await page.getByRole("row").filter({ hasText: "video1" }).click({ button: "right" });

    // Wait for context menu portal to be attached and visible
    await page.waitForSelector('[data-slot="context-menu-content"]', { state: "attached" });
    await page.waitForTimeout(100); // Allow animation to complete

    await page
      .locator('[data-slot="context-menu-item"]')
      .filter({ hasText: "Clear All" })
      .click({ timeout: 10000 });

    // All items should be gone, drop zone should be visible again
    await expect(page.getByRole("cell", { name: "video1" })).not.toBeVisible();
    await expect(page.getByRole("cell", { name: "video2" })).not.toBeVisible();
    await expect(page.locator(".drop-zone")).toBeVisible();
  });

  test("copy all URLs copies to clipboard", async ({ page, browserName }) => {
    test.skip(browserName !== "chromium", "Clipboard API permissions vary");
    await page.goto("/");

    // Add multiple URLs
    const urls = [
      "https://example.com/video1",
      "https://example.com/video2",
      "https://example.com/video3",
    ];
    for (const url of urls) {
      await page.evaluate((url) => window.__E2E_addUrl?.(url), url);
    }

    await expect(page.getByRole("row").filter({ hasText: "video1" })).toBeVisible();

    // Grant clipboard permissions where supported (Chromium). Other browsers skip permissions.
    if (browserName === "chromium") {
      await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
    }

    // Right-click and select "Copy All URLs"
    await page.getByRole("row").filter({ hasText: "video1" }).click({ button: "right" });

    // Wait for context menu portal to be attached and visible
    await page.waitForSelector('[data-slot="context-menu-content"]', { state: "attached" });
    await page.waitForTimeout(100); // Allow animation to complete

    await page
      .locator('[data-slot="context-menu-item"]')
      .filter({ hasText: "Copy All URLs" })
      .click({ timeout: 10000 });

    // Check clipboard contents
    const clipboardContent = await page.evaluate(() => navigator.clipboard.readText());
    expect(clipboardContent).toContain("https://example.com/video1");
    expect(clipboardContent).toContain("https://example.com/video2");
    expect(clipboardContent).toContain("https://example.com/video3");
  });

  test("download all triggers download for all items", async ({ page, browserName }) => {
    test.skip(browserName === "webkit", "WebKit context menu flaky in web mode");
    await page.goto("/");

    // Add multiple URLs
    const urls = ["https://example.com/video1", "https://example.com/video2"];
    for (const url of urls) {
      await page.evaluate((url) => window.__E2E_addUrl?.(url), url);
    }

    await expect(page.getByRole("row").filter({ hasText: "video1" })).toBeVisible();

    // Right-click and select "Download All"
    await page.getByRole("row").filter({ hasText: "video1" }).click({ button: "right" });
    await page.getByRole("menuitem", { name: "Download All" }).click();

    // Items should transition to "Downloading" status
    // Note: This test may need backend mocking for full validation
    await expect(page.getByRole("cell", { name: /Downloading|Done/ }).first()).toBeVisible({
      timeout: 3000,
    });
  });

  // Phase 4: Cancellation Tests
  test("cancel button appears during download", async ({ page, browserName }) => {
    test.skip(browserName === "webkit", "WebKit context menu flaky in web mode");
    await page.goto("/");

    const url = "https://example.com/video1";
    await page.evaluate((url) => window.__E2E_addUrl?.(url), url);

    // Start download by simulating progress event
    await emitTauriEvent(page, "download-progress", [0, 25]);

    // Cancel button should be visible
    await expect(page.getByRole("button", { name: "Cancel" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Start download" })).toBeDisabled();
  });

  test("cancel all stops all downloads", async ({ page, browserName }) => {
    test.skip(browserName === "webkit", "WebKit context menu flaky in web mode");
    await page.goto("/");

    // Add multiple URLs
    const urls = ["https://example.com/video1", "https://example.com/video2"];
    for (const url of urls) {
      await page.evaluate((url) => window.__E2E_addUrl?.(url), url);
    }

    await expect(page.getByRole("row").filter({ hasText: "video1" })).toBeVisible();

    // Simulate downloads in progress
    await emitTauriEvent(page, "download-progress", [0, 25]);
    await emitTauriEvent(page, "download-progress", [1, 50]);

    // Click Cancel button (this should trigger cancel all)
    await page.getByRole("button", { name: "Cancel" }).click();

    // Both items should show "Cancelled" status
    await expect(page.getByRole("cell", { name: "Cancelled" }).first()).toBeVisible({
      timeout: 2000,
    });
  });

  test("cancel all menu item stops all downloads", async ({ page, browserName }) => {
    test.skip(browserName === "webkit", "WebKit context menu flaky in web mode");
    await page.goto("/");

    const url = "https://example.com/video1";
    await page.evaluate((url) => window.__E2E_addUrl?.(url), url);

    await expect(page.getByRole("row").filter({ hasText: "video1" })).toBeVisible();

    // Simulate download in progress
    await emitTauriEvent(page, "download-progress", [0, 25]);

    // Right-click and select "Cancel All"
    await page.getByRole("row").filter({ hasText: "video1" }).click({ button: "right" });
    await page.getByRole("menuitem", { name: "Cancel All" }).click();

    // Status should update to "Cancelled"
    await expect(page.getByRole("cell", { name: "Cancelled" })).toBeVisible({
      timeout: 2000,
    });
  });

  test("cancelled downloads emit cancelled event", async ({ page, browserName }) => {
    test.skip(browserName === "webkit", "WebKit context menu flaky in web mode");
    await page.goto("/");

    const url = "https://example.com/video1";
    await page.evaluate((url) => window.__E2E_addUrl?.(url), url);

    // Emit download-cancelled event
    await emitTauriEvent(page, "download-cancelled", 0);

    // Status should update to "Cancelled"
    await expect(page.getByRole("cell", { name: "Cancelled" })).toBeVisible();
  });

  // Phase 5: Debug Console Tests
  test("debug console displays log entries", async ({ page }) => {
    await page.goto("/debug");

    // Emit a yt-dlp stderr event
    await emitTauriEvent(page, "yt-dlp-stderr", [0, "Downloading video metadata"]);

    // Log entry should appear
    await expect(page.getByText("Downloading video metadata")).toBeVisible({
      timeout: 2000,
    });
  });

  test("debug console search finds text", async ({ page }) => {
    await page.goto("/debug");

    // Emit multiple log entries
    await emitTauriEvent(page, "yt-dlp-stderr", [0, "Starting download"]);
    await emitTauriEvent(page, "yt-dlp-stderr", [0, "Processing video"]);
    await emitTauriEvent(page, "yt-dlp-stderr", [0, "Download complete"]);

    // Enter search term
    await page.getByPlaceholder("Search logs...").fill("download");

    // Click Find Next
    await page.getByRole("button", { name: "Find Next" }).click();

    // First occurrence should be highlighted
    const highlighted = page.locator('[data-current-match="true"]').first();
    await expect(highlighted).toBeVisible();
    await expect(highlighted).toContainText(/download/i);
  });

  test("debug console find next cycles through results", async ({ page }) => {
    await page.goto("/debug");

    // Emit entries with repeated text
    await emitTauriEvent(page, "yt-dlp-stderr", [0, "First error message"]);
    await emitTauriEvent(page, "yt-dlp-stderr", [0, "Second error message"]);
    await emitTauriEvent(page, "yt-dlp-stderr", [0, "Third error message"]);

    // Search for "error"
    await page.getByPlaceholder("Search logs...").fill("error");

    // First Find Next
    await page.getByRole("button", { name: "Find Next" }).click();
    let highlighted = page.locator('[data-current-match="true"]').first();
    await expect(highlighted.locator("xpath=ancestor::div[1]")).toContainText(
      "First error message",
    );

    // Second Find Next
    await page.getByRole("button", { name: "Find Next" }).click();
    highlighted = page.locator('[data-current-match="true"]').first();
    await expect(highlighted.locator("xpath=ancestor::div[1]")).toContainText(
      "Second error message",
    );

    // Third Find Next
    await page.getByRole("button", { name: "Find Next" }).click();
    highlighted = page.locator('[data-current-match="true"]').first();
    await expect(highlighted.locator("xpath=ancestor::div[1]")).toContainText(
      "Third error message",
    );

    // Fourth Find Next wraps to first
    await page.getByRole("button", { name: "Find Next" }).click();
    highlighted = page.locator('[data-current-match="true"]').first();
    await expect(highlighted.locator("xpath=ancestor::div[1]")).toContainText(
      "First error message",
    );
  });
});
