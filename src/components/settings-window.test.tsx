/**
 * Tests for SettingsWindow component
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "bun:test";
import { TestingLibraryMatchers } from "@testing-library/jest-dom/matchers";

// Extend Bun's expect with jest-dom matchers
declare module "bun:test" {
  interface Matchers<T> extends TestingLibraryMatchers<typeof expect.stringContaining, T> {}
}

import { renderWithProviders, screen, userEvent } from "@/test/test-utils";
import { SettingsWindow } from "./settings-window";

describe("SettingsWindow", () => {
  let originalLocation: Location;

  beforeEach(() => {
    // Clear localStorage to ensure clean state for atomWithStorage
    localStorage.clear();
    vi.clearAllMocks();
    // Save original location before each test
    originalLocation = window.location;
  });

  afterEach(() => {
    // Restore original location after each test
    Object.defineProperty(window, "location", {
      value: originalLocation,
      writable: true,
      configurable: true,
    });
  });

  describe("close behavior", () => {
    it("calls onClose when provided", async () => {
      const user = userEvent.setup();
      const onClose = vi.fn();

      renderWithProviders(<SettingsWindow onClose={onClose} />);

      await user.click(screen.getByTestId("settings-window-close"));

      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it("navigates away from /settings in web runtime when no onClose is provided", async () => {
      const user = userEvent.setup();

      const assignSpy = vi.fn();
      Object.defineProperty(window, "location", {
        value: {
          pathname: "/settings",
          assign: assignSpy,
        },
        writable: true,
        configurable: true,
      });

      renderWithProviders(<SettingsWindow />);

      await user.click(screen.getByTestId("settings-window-close"));

      expect(assignSpy).toHaveBeenCalledWith("/");
    });
  });
});
