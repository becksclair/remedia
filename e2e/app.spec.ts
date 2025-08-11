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
		await expect(page.locator("role=progressbar").first()).toBeVisible();
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
});
