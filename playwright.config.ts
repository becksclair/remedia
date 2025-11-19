import { defineConfig, devices } from "@playwright/test";

const webOnly = !!process.env.PW_WEB_ONLY;

export default defineConfig({
  testDir: "./e2e",
  outputDir: "./test-results",
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 4 : 8,
  webServer: {
    command: webOnly ? "bun run dev" : "bun tauri dev",
    url: process.env.VITE_DEV_SERVER_URL || "http://localhost:1420",
    reuseExistingServer: !process.env.CI,
  },
  use: {
    baseURL: "http://localhost:1420",
    trace: "on-first-retry",
    video: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "firefox",
      use: { ...devices["Desktop Firefox"] },
    },
    {
      name: "webkit",
      use: { ...devices["Desktop Safari"] },
    },
  ],
});
