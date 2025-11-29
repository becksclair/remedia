import { renderHook } from "@testing-library/react";
import { useTheme } from "./useTheme";
import { useAtomValue } from "jotai";
import { describe, it, expect, beforeEach, afterEach, mock, vi } from "bun:test";

// Mock jotai
void vi.mock("jotai", () => ({
  useAtomValue: mock(),
}));

describe("useTheme", () => {
  let matchMediaMock: any;
  let listeners: any = {};

  beforeEach(() => {
    // Reset document class list
    document.documentElement.classList.remove("dark");

    // Mock matchMedia
    listeners = {};
    matchMediaMock = mock().mockImplementation((query) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: mock((event, callback) => {
        listeners[event] = callback;
      }),
      removeEventListener: mock(),
      dispatchEvent: mock(),
    }));
    window.matchMedia = matchMediaMock;
  });

  afterEach(() => {
    // Note: Bun doesn't have clearAllMocks equivalent
  });

  it("applies system theme on mount (dark)", () => {
    // Mock system dark mode
    matchMediaMock.mockImplementation((query: string) => ({
      matches: true, // System is dark
      media: query,
      addEventListener: mock(),
      removeEventListener: mock(),
    }));

    // Mock theme atom value as 'system'
    (useAtomValue as any).mockReturnValue("system");

    renderHook(() => useTheme());

    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });

  it("applies system theme on mount (light)", () => {
    // Mock system light mode
    matchMediaMock.mockImplementation((query: string) => ({
      matches: false, // System is light
      media: query,
      addEventListener: mock(),
      removeEventListener: mock(),
    }));

    (useAtomValue as any).mockReturnValue("system");

    renderHook(() => useTheme());

    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });

  it("toggles dark class when theme changes to dark", () => {
    (useAtomValue as any).mockReturnValue("dark");

    renderHook(() => useTheme());

    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });

  it("toggles dark class when theme changes to light", () => {
    // First set it to dark
    document.documentElement.classList.add("dark");
    (useAtomValue as any).mockReturnValue("light");

    renderHook(() => useTheme());

    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });

  it("responds to system preference changes", () => {
    // Initial state: system is light
    matchMediaMock.mockImplementation((query: string) => ({
      matches: false,
      media: query,
      addEventListener: vi.fn((event, callback) => {
        listeners[event] = callback;
      }),
      removeEventListener: vi.fn(),
    }));

    (useAtomValue as any).mockReturnValue("system");

    renderHook(() => useTheme());
    expect(document.documentElement.classList.contains("dark")).toBe(false);

    // Change system preference to dark
    matchMediaMock.mockImplementation((query: string) => ({
      matches: true, // Now it is dark
      media: query,
      addEventListener: mock(),
      removeEventListener: mock(),
    }));

    // Trigger change listener
    if (listeners["change"]) {
      listeners["change"]();
    }

    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });

  it("handles missing matchMedia gracefully", () => {
    // Remove matchMedia
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: undefined,
    });

    (useAtomValue as any).mockReturnValue("system");

    // Should not throw
    expect(() => renderHook(() => useTheme())).not.toThrow();
  });

  it("cleans up event listener on unmount", () => {
    const removeEventListenerSpy = mock();
    matchMediaMock.mockImplementation((query: string) => ({
      matches: false,
      media: query,
      addEventListener: mock(),
      removeEventListener: removeEventListenerSpy,
    }));

    (useAtomValue as any).mockReturnValue("system");

    const { unmount } = renderHook(() => useTheme());
    unmount();

    expect(removeEventListenerSpy).toHaveBeenCalled();
  });
});
