/**
 * Global test setup to ensure clean state across all test files
 * This should be imported in test files that use Jotai atoms
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

// Run cleanup before each test file
setupGlobalTestCleanup();
