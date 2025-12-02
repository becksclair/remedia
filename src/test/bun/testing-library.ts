import { afterEach, expect, beforeAll, beforeEach, mock } from "bun:test";
import { cleanup } from "@testing-library/react";
import * as matchers from "@testing-library/jest-dom/matchers";

// Extend Bun's expect with jest-dom matchers
expect.extend(matchers);

// Export URLSearchParams mock for tests to use
export const mockURLSearchParamsGet = mock((): string | null => null);

// Clear localStorage before each test to prevent atomWithStorage pollution
beforeEach(() => {
  if (typeof localStorage !== "undefined") {
    localStorage.clear();
  }
});

// Set up mocks before all tests
beforeAll(() => {
  // Mock scrollIntoView which is not implemented in happy-dom
  if (typeof Element !== "undefined") {
    Element.prototype.scrollIntoView = () => {};
  }

  // Mock window.matchMedia which is not implemented in happy-dom
  if (typeof window !== "undefined") {
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: (query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: (_event: Event) => true,
      }),
    });

    // Mock URLSearchParams with more complete implementation
    const OriginalURLSearchParams = window.URLSearchParams;
    const mockURLSearchParams = function (this: any, init?: any) {
      const instance = new OriginalURLSearchParams(init);
      // Override only the get method for testing purposes
      instance.get = mockURLSearchParamsGet as any;
      return instance;
    };

    Object.defineProperty(window, "URLSearchParams", {
      value: mockURLSearchParams,
      writable: true,
    });
  }
});

// Optional: cleans up `render` after each test
afterEach(() => {
  cleanup();
});
