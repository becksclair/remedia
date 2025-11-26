// @vitest-environment jsdom
import { expect, afterEach, vi } from "vitest";
import { cleanup } from "@testing-library/react";
import * as matchers from "@testing-library/jest-dom/matchers";

// Extend Vitest's expect with jest-dom matchers
expect.extend(matchers);

// Cleanup after each test
afterEach(() => {
  cleanup();
});

// Only set up DOM mocks if we're in a DOM environment
if (typeof Element !== "undefined") {
  // Mock scrollIntoView which is not implemented in jsdom
  Element.prototype.scrollIntoView = vi.fn();
}

if (typeof window !== "undefined") {
  // Mock window.matchMedia which is not implemented in jsdom
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: vi.fn().mockImplementation((query) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
}
