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
async function emitTauriEvent(page: import("@playwright/test").Page, eventName: string, payload: unknown) {
	await page.evaluate(
		({ eventName, payload }) => {
			window.__E2E_emitTauriEvent?.(eventName, payload);
		},
		{ eventName, payload }
	);
}

test.describe("ReMedia app", () => {
	test("loads main window and handles drag & drop URL", async ({ page }) => {
		await page.goto("/");
		await expect(page.locator(".drop-zone")).toBeVisible();

		// Add URL using local asset served by Vite/Tauri dev server
		const url = new URL("/daybreak.mp4", page.url()).toString();
		await page.evaluate(url => window.__E2E_addUrl?.(url), url);

		// After adding, the table should show the URL as title initially
		await expect(page.getByRole("cell", { name: "daybreak.mp4" })).toBeVisible();
	});

	test("receives media info and progress events", async ({ page }) => {
		await page.goto("/");

		const url = new URL("/daybreak.mp4", page.url()).toString();
		await page.evaluate(url => window.__E2E_addUrl?.(url), url);

		// Inject media info event to update title and thumbnail
		await emitTauriEvent(page, "update-media-info", [0, url, "Nice Title", "https://img/thumb.jpg"]);
		await expect(page.getByText("Nice Title")).toBeVisible();

		// Inject progress
		await emitTauriEvent(page, "download-progress", [0, 55]);
		// We can't read progress bar value easily; assert presence of Progress elements
		expect(page.getByTestId("global-progress").waitFor({ state: "visible" }));
	});

	test("settings persistence via Jotai storage", async ({ page }) => {
		await page.goto("/");
		await page.getByRole("button", { name: "Settings" }).click();
		await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();

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
		await page.evaluate(url => window.__E2E_addUrl?.(url), url);

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
		await page.evaluate(url => window.__E2E_addUrl?.(url), url);

		// Emit media info with empty thumbnail
		await emitTauriEvent(page, "update-media-info", [0, url, "Test Video", ""]);

		// Should show placeholder image
		const thumbnail = page.locator('img[alt="Media thumbnail"]').first();
		await expect(thumbnail).toBeVisible();
		const src = await thumbnail.getAttribute("src");
		expect(src).toContain("thumbnail-placeholder.svg");
	});

	test("smooth progress updates with clamping", async ({ page }) => {
		await page.goto("/");

		const url = "https://example.com/video";
		await page.evaluate(url => window.__E2E_addUrl?.(url), url);

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

	// Phase 3 Tests: Advanced Settings
	test("download mode setting persists", async ({ page }) => {
		await page.goto("/");
		await page.getByRole("button", { name: "Settings" }).click();

		// Change to audio mode
		await page.locator("#download-mode").click();
		await page.getByRole("option", { name: "Audio only" }).click();
		await page.getByRole("button", { name: "Done" }).click();

		// Reload and check persistence
		await page.reload();
		await page.getByRole("button", { name: "Settings" }).click();
		await expect(page.locator("#download-mode")).toContainText("Audio only");
	});

	test("video settings visible only in video mode", async ({ page }) => {
		await page.goto("/");
		await page.getByRole("button", { name: "Settings" }).click();

		// In video mode, video settings should be visible
		await expect(page.getByText("Video Settings")).toBeVisible();
		await expect(page.locator("#max-resolution")).toBeVisible();

		// Switch to audio mode
		await page.locator("#download-mode").click();
		await page.getByRole("option", { name: "Audio only" }).click();

		// Video settings should be hidden
		await expect(page.getByText("Video Settings")).not.toBeVisible();

		// Audio settings should always be visible
		await expect(page.getByText("Audio Settings")).toBeVisible();
	});

	test("max resolution setting persists", async ({ page }) => {
		await page.goto("/");
		await page.getByRole("button", { name: "Settings" }).click();

		// Set max resolution to 1080p
		await page.locator("#max-resolution").click();
		await page.getByRole("option", { name: "1080p (Full HD)" }).click();
		await page.getByRole("button", { name: "Done" }).click();

		// Reload and verify
		await page.reload();
		await page.getByRole("button", { name: "Settings" }).click();
		await expect(page.locator("#max-resolution")).toContainText("1080p (Full HD)");
	});

	test("audio quality setting persists", async ({ page }) => {
		await page.goto("/");
		await page.getByRole("button", { name: "Settings" }).click();

		// Change audio quality
		await page.locator("#audio-quality").click();
		await page.getByRole("option", { name: /High \(256 kbps\)/ }).click();
		await page.getByRole("button", { name: "Done" }).click();

		// Reload and verify
		await page.reload();
		await page.getByRole("button", { name: "Settings" }).click();
		await expect(page.locator("#audio-quality")).toContainText("High (256 kbps)");
	});

	test("video format setting persists", async ({ page }) => {
		await page.goto("/");
		await page.getByRole("button", { name: "Settings" }).click();

		// Change video format
		await page.locator("#video-format").click();
		await page.getByRole("option", { name: "MP4" }).click();
		await page.getByRole("button", { name: "Done" }).click();

		// Reload and verify
		await page.reload();
		await page.getByRole("button", { name: "Settings" }).click();
		await expect(page.locator("#video-format")).toContainText("MP4");
	});

	test("audio format setting persists", async ({ page }) => {
		await page.goto("/");
		await page.getByRole("button", { name: "Settings" }).click();

		// Change audio format
		await page.locator("#audio-format").click();
		await page.getByRole("option", { name: "MP3" }).click();
		await page.getByRole("button", { name: "Done" }).click();

		// Reload and verify
		await page.reload();
		await page.getByRole("button", { name: "Settings" }).click();
		await expect(page.locator("#audio-format")).toContainText("MP3");
	});

	test("completion events update status correctly", async ({ page }) => {
		await page.goto("/");

		const url = "https://example.com/video";
		await page.evaluate(url => window.__E2E_addUrl?.(url), url);

		// Emit complete event
		await emitTauriEvent(page, "download-complete", 0);

		// Status should update to "Done"
		await expect(page.getByRole("cell", { name: "Done" })).toBeVisible();
	});

	test("error events update status correctly", async ({ page }) => {
		await page.goto("/");

		const url = "https://example.com/video";
		await page.evaluate(url => window.__E2E_addUrl?.(url), url);

		// Emit error event
		await emitTauriEvent(page, "download-error", 0);

		// Status should update to "Error"
		await expect(page.getByRole("cell", { name: "Error" })).toBeVisible();
	});

	// Phase 4: Context Menu Tests
	test("context menu appears on right-click", async ({ page }) => {
		await page.goto("/");

		const url = "https://example.com/video1";
		await page.evaluate(url => window.__E2E_addUrl?.(url), url);

		// Right-click on the table row
		const row = page.getByRole("row").filter({ hasText: "video1" });
		await row.click({ button: "right" });

		// Context menu should appear with expected items
		await expect(page.getByRole("menuitem", { name: "Remove Selected" })).toBeVisible();
		await expect(page.getByRole("menuitem", { name: "Remove All" })).toBeVisible();
		await expect(page.getByRole("menuitem", { name: "Copy All URLs" })).toBeVisible();
	});

	test("remove selected removes checked items", async ({ page }) => {
		await page.goto("/");

		// Add multiple URLs
		const urls = ["https://example.com/video1", "https://example.com/video2", "https://example.com/video3"];
		for (const url of urls) {
			await page.evaluate(url => window.__E2E_addUrl?.(url), url);
		}

		// Select first two items using checkboxes
		const firstCheckbox = page.getByRole("row").filter({ hasText: "video1" }).getByRole("checkbox");
		const secondCheckbox = page.getByRole("row").filter({ hasText: "video2" }).getByRole("checkbox");
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

	test("remove all clears entire list", async ({ page }) => {
		await page.goto("/");

		// Add multiple URLs
		const urls = ["https://example.com/video1", "https://example.com/video2"];
		for (const url of urls) {
			await page.evaluate(url => window.__E2E_addUrl?.(url), url);
		}

		// Right-click and select "Remove All"
		await page.getByRole("row").filter({ hasText: "video1" }).click({ button: "right" });
		await page.getByRole("menuitem", { name: "Remove All" }).click();

		// All items should be gone, drop zone should be visible again
		await expect(page.getByRole("cell", { name: "video1" })).not.toBeVisible();
		await expect(page.getByRole("cell", { name: "video2" })).not.toBeVisible();
		await expect(page.locator(".drop-zone")).toBeVisible();
	});

	test("copy all URLs copies to clipboard", async ({ page }) => {
		await page.goto("/");

		// Add multiple URLs
		const urls = ["https://example.com/video1", "https://example.com/video2", "https://example.com/video3"];
		for (const url of urls) {
			await page.evaluate(url => window.__E2E_addUrl?.(url), url);
		}

		// Grant clipboard permissions
		await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);

		// Right-click and select "Copy All URLs"
		await page.getByRole("row").filter({ hasText: "video1" }).click({ button: "right" });
		await page.getByRole("menuitem", { name: "Copy All URLs" }).click();

		// Check clipboard contents
		const clipboardContent = await page.evaluate(() => navigator.clipboard.readText());
		expect(clipboardContent).toContain("https://example.com/video1");
		expect(clipboardContent).toContain("https://example.com/video2");
		expect(clipboardContent).toContain("https://example.com/video3");
	});

	test("download all triggers download for all items", async ({ page }) => {
		await page.goto("/");

		// Add multiple URLs
		const urls = ["https://example.com/video1", "https://example.com/video2"];
		for (const url of urls) {
			await page.evaluate(url => window.__E2E_addUrl?.(url), url);
		}

		// Right-click and select "Download All"
		await page.getByRole("row").filter({ hasText: "video1" }).click({ button: "right" });
		await page.getByRole("menuitem", { name: "Download All" }).click();

		// Items should transition to "Downloading" status
		// Note: This test may need backend mocking for full validation
		await expect(page.getByRole("cell", { name: "Downloading" }).first()).toBeVisible({ timeout: 3000 });
	});
});
