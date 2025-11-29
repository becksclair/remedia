import { expect, afterEach, vi, beforeAll } from "vitest";
import { cleanup } from "@testing-library/react";
import * as matchers from "@testing-library/jest-dom/matchers";

// Extend Vitest's expect with jest-dom matchers
expect.extend(matchers);

// Export URLSearchParams mock for tests to use
export const mockURLSearchParamsGet = vi.fn();

// Set up mocks before all tests
beforeAll(() => {
  // Mock scrollIntoView which is not implemented in jsdom/happy-dom
  if (typeof Element !== "undefined") {
    Element.prototype.scrollIntoView = vi.fn();
  }

  // Mock window.matchMedia which is not implemented in jsdom/happy-dom
  if (typeof window !== "undefined") {
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

    // Mock URLSearchParams
    const mockURLSearchParams = vi.fn().mockImplementation(function (this: any) {
      this.get = mockURLSearchParamsGet;
    });

    Object.defineProperty(window, "URLSearchParams", {
      value: mockURLSearchParams,
      writable: true,
    });
  }
});

// Cleanup after each test
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
