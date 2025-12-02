/**
 * Tests for SettingsWindow component
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "bun:test";
import { TestingLibraryMatchers } from "@testing-library/jest-dom/matchers";

// Extend Bun's expect with jest-dom matchers
declare module "bun:test" {
  interface Matchers<T> extends TestingLibraryMatchers<typeof expect.stringContaining, T> {}
}

import { renderWithProviders, screen, userEvent, waitFor } from "@/test/test-utils";
import { SettingsWindow } from "./settings-window";

// Mock the Window API
const mockWindow = {
  close: vi.fn().mockResolvedValue(undefined),
};

void vi.mock("@tauri-apps/api/window", () => ({
  Window: {
    getCurrent: vi.fn(() => mockWindow),
  },
}));

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

  describe("rendering", () => {
    it("renders all tabs and content", () => {
      renderWithProviders(<SettingsWindow />);

      expect(screen.getByText("Settings")).toBeInTheDocument();
      expect(screen.getByText("Configure your download preferences and quality settings.")).toBeInTheDocument();

      // Check all tabs are rendered
      expect(screen.getByRole("tab", { name: /general/i })).toBeInTheDocument();
      expect(screen.getByRole("tab", { name: /downloads/i })).toBeInTheDocument();
      expect(screen.getByRole("tab", { name: /quality/i })).toBeInTheDocument();

      // Check tablist has correct role
      const tablist = screen.getByRole("tablist");
      expect(tablist).toBeInTheDocument();
    });

    it("renders with accessibility attributes", () => {
      renderWithProviders(<SettingsWindow />);

      const tablist = screen.getByRole("tablist");
      expect(tablist).toBeInTheDocument();

      const tabs = screen.getAllByRole("tab");
      expect(tabs).toHaveLength(3);

      // Check that tabs have aria-selected attributes
      tabs.forEach((tab) => {
        expect(tab).toHaveAttribute("aria-selected");
      });
    });
  });

  describe("tab switching", () => {
    it("switches to downloads tab when clicked", async () => {
      const user = userEvent.setup();
      renderWithProviders(<SettingsWindow />);

      const downloadsTab = screen.getByRole("tab", { name: /downloads/i });
      await user.click(downloadsTab);

      // Downloads tab should have aria-selected attribute (Radix UI manages the value)
      expect(downloadsTab).toHaveAttribute("aria-selected");
    });

    it("switches to quality tab when clicked", async () => {
      const user = userEvent.setup();
      renderWithProviders(<SettingsWindow />);

      const qualityTab = screen.getByRole("tab", { name: /quality/i });
      await user.click(qualityTab);

      // Quality tab should have aria-selected attribute
      expect(qualityTab).toHaveAttribute("aria-selected");
    });

    it("switches back to general tab when clicked", async () => {
      const user = userEvent.setup();
      renderWithProviders(<SettingsWindow />);

      // Switch to downloads first
      const downloadsTab = screen.getByRole("tab", { name: /downloads/i });
      await user.click(downloadsTab);

      // Then switch back to general
      const generalTab = screen.getByRole("tab", { name: /general/i });
      await user.click(generalTab);

      // General tab should have aria-selected attribute
      expect(generalTab).toHaveAttribute("aria-selected");
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

    it("calls window.close in web runtime when pathname is not /settings", async () => {
      const user = userEvent.setup();
      const closeSpy = vi.fn();

      Object.defineProperty(window, "location", {
        value: {
          pathname: "/other",
          assign: vi.fn(),
        },
        writable: true,
        configurable: true,
      });

      Object.defineProperty(window, "close", {
        value: closeSpy,
        writable: true,
        configurable: true,
      });

      renderWithProviders(<SettingsWindow />);

      await user.click(screen.getByTestId("settings-window-close"));

      expect(closeSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe("Tauri runtime close behavior", () => {
    beforeEach(() => {
      // Set up Tauri runtime by adding __TAURI__ to window
      Object.defineProperty(window, "__TAURI__", {
        value: {},
        writable: true,
        configurable: true,
      });
    });

    afterEach(() => {
      // Clean up Tauri runtime mock
      delete (window as { __TAURI__?: unknown }).__TAURI__;
    });

    it("calls Window.getCurrent().close() in Tauri runtime when no onClose provided", async () => {
      const user = userEvent.setup();

      renderWithProviders(<SettingsWindow />);

      await user.click(screen.getByTestId("settings-window-close"));

      expect(mockWindow.close).toHaveBeenCalledTimes(1);
    });

    it("handles window close errors gracefully in Tauri runtime", async () => {
      const user = userEvent.setup();
      const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      mockWindow.close.mockRejectedValueOnce(new Error("Close failed"));

      renderWithProviders(<SettingsWindow />);

      await user.click(screen.getByTestId("settings-window-close"));

      // Wait for promise rejection to be handled
      await waitFor(() => {
        expect(consoleErrorSpy).toHaveBeenCalled();
      });

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        "Failed to close settings window:",
        expect.any(Error),
      );

      consoleErrorSpy.mockRestore();
    });
  });

  describe("error handling", () => {
    it("handles window.location.assign errors gracefully", async () => {
      const user = userEvent.setup();
      const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      const assignError = new Error("Navigation failed");

      Object.defineProperty(window, "location", {
        value: {
          pathname: "/settings",
          assign: vi.fn(() => {
            throw assignError;
          }),
        },
        writable: true,
        configurable: true,
      });

      renderWithProviders(<SettingsWindow />);

      await user.click(screen.getByTestId("settings-window-close"));

      expect(consoleErrorSpy).toHaveBeenCalledWith("Failed to close settings window:", assignError);

      consoleErrorSpy.mockRestore();
    });

    it("handles window.close errors gracefully", async () => {
      const user = userEvent.setup();
      const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      const closeError = new Error("Close failed");

      Object.defineProperty(window, "location", {
        value: {
          pathname: "/other",
          assign: vi.fn(),
        },
        writable: true,
        configurable: true,
      });

      Object.defineProperty(window, "close", {
        value: vi.fn(() => {
          throw closeError;
        }),
        writable: true,
        configurable: true,
      });

      renderWithProviders(<SettingsWindow />);

      await user.click(screen.getByTestId("settings-window-close"));

      expect(consoleErrorSpy).toHaveBeenCalledWith("Failed to close settings window:", closeError);

      consoleErrorSpy.mockRestore();
    });
  });
});
