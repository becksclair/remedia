import { renderHook } from "@testing-library/react";
import { useTheme } from "./useTheme";
import { useAtomValue } from "jotai";
import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";

// Mock jotai
vi.mock("jotai", () => ({
  useAtomValue: vi.fn(),
}));

describe("useTheme", () => {
  let matchMediaMock: any;
  let listeners: any = {};

  beforeEach(() => {
    // Reset document class list
    document.documentElement.classList.remove("dark");

    // Mock matchMedia
    listeners = {};
    matchMediaMock = vi.fn().mockImplementation((query) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: vi.fn((event, callback) => {
        listeners[event] = callback;
      }),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));
    window.matchMedia = matchMediaMock;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("applies system theme on mount (dark)", () => {
    // Mock system dark mode
    matchMediaMock.mockImplementation((query: string) => ({
      matches: true, // System is dark
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
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
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
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
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
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
});
