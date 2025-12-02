/**
 * Global test setup to ensure clean state across all test files
 *
 * Usage:
 * - Import: `import { setupGlobalTestCleanup } from "@/test/global-setup"`
 * - Use `setupGlobalTestCleanup()` in beforeAll hooks for one-time setup
 * - Use `setupGlobalTestCleanup()` in beforeEach hooks for per-test cleanup
 *
 * This file exports a single cleanup function that can be used in test files
 */

import { vi } from "bun:test";

// Global setup function to clean up test state
export function setupGlobalTestCleanup() {
  // Clear localStorage to prevent atomWithStorage state pollution
  if (typeof localStorage !== "undefined") {
    localStorage.clear();
  }

  // Clear all mocks and restore spies
  vi.clearAllMocks();
  vi.restoreAllMocks();
}
