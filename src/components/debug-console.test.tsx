import { describe, it, expect, beforeEach } from "vitest";
import {
  renderWithProviders,
  screen,
  userEvent,
  waitForAsync,
} from "@/test/test-utils";
import { DebugConsole } from "./debug-console";
import { logEntriesAtom } from "@/state/app-atoms";
import type { LogEntry } from "@/utils/log-helpers";

describe("DebugConsole", () => {
  const createLogEntry = (
    message: string,
    level: "info" | "warn" | "error" = "info",
  ): LogEntry => ({
    timestamp: Date.now(),
    source: "test",
    level,
    message,
  });

  beforeEach(() => {
    // Reset between tests
  });

  describe("Initial Render", () => {
    it("renders empty state message when no logs", () => {
      renderWithProviders(<DebugConsole />, {
        initialAtomValues: [[logEntriesAtom, []]],
      });

      expect(screen.getByText(/no log entries yet/i)).toBeInTheDocument();
    });

    it("renders search input and Find Next button", () => {
      renderWithProviders(<DebugConsole />);

      expect(screen.getByPlaceholderText(/search logs/i)).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: /find next/i }),
      ).toBeInTheDocument();
    });

    it("has disabled Find Next button when no matches", () => {
      renderWithProviders(<DebugConsole />);

      const findNextButton = screen.getByRole("button", { name: /find next/i });
      expect(findNextButton).toBeDisabled();
    });
  });

  describe("Log Display", () => {
    it("displays log entries", () => {
      const logs = [
        createLogEntry("First log message"),
        createLogEntry("Second log message"),
        createLogEntry("Third log message"),
      ];

      renderWithProviders(<DebugConsole />, {
        initialAtomValues: [[logEntriesAtom, logs]],
      });

      expect(screen.getByText("First log message")).toBeInTheDocument();
      expect(screen.getByText("Second log message")).toBeInTheDocument();
      expect(screen.getByText("Third log message")).toBeInTheDocument();
    });

    it("displays log level with correct color for errors", () => {
      const logs = [createLogEntry("Error message", "error")];

      renderWithProviders(<DebugConsole />, {
        initialAtomValues: [[logEntriesAtom, logs]],
      });

      const logElement = screen.getByText("Error message").closest("div");
      expect(logElement).toHaveClass("text-red-600");
    });

    it("displays log level with correct color for warnings", () => {
      const logs = [createLogEntry("Warning message", "warn")];

      renderWithProviders(<DebugConsole />, {
        initialAtomValues: [[logEntriesAtom, logs]],
      });

      const logElement = screen.getByText("Warning message").closest("div");
      expect(logElement).toHaveClass("text-yellow-600");
    });

    it("displays log level with correct color for info", () => {
      const logs = [createLogEntry("Info message", "info")];

      renderWithProviders(<DebugConsole />, {
        initialAtomValues: [[logEntriesAtom, logs]],
      });

      const logElement = screen.getByText("Info message").closest("div");
      expect(logElement).toHaveClass("text-gray-700");
    });

    it("displays timestamps for each log entry", () => {
      const now = Date.now();
      const logs = [{ ...createLogEntry("Test"), timestamp: now }];

      renderWithProviders(<DebugConsole />, {
        initialAtomValues: [[logEntriesAtom, logs]],
      });

      const timestamp = new Date(now).toLocaleTimeString();
      expect(screen.getByText(timestamp)).toBeInTheDocument();
    });

    it("displays source for each log entry", () => {
      const logs = [createLogEntry("Test message")];

      renderWithProviders(<DebugConsole />, {
        initialAtomValues: [[logEntriesAtom, logs]],
      });

      expect(screen.getByText("[test]")).toBeInTheDocument();
    });

    it("displays media index when present", () => {
      const logs = [{ ...createLogEntry("Test"), mediaIdx: 5 }];

      renderWithProviders(<DebugConsole />, {
        initialAtomValues: [[logEntriesAtom, logs]],
      });

      expect(screen.getByText("[media-5]")).toBeInTheDocument();
    });
  });

  describe("Search Functionality", () => {
    it("allows typing in search input", async () => {
      const user = userEvent.setup();
      renderWithProviders(<DebugConsole />);

      const searchInput = screen.getByPlaceholderText(/search logs/i);
      await user.type(searchInput, "test");

      expect(searchInput).toHaveValue("test");
    });

    it("enables Find Next button when search has matches", async () => {
      const user = userEvent.setup();
      const logs = [
        createLogEntry("error occurred"),
        createLogEntry("normal message"),
      ];

      renderWithProviders(<DebugConsole />, {
        initialAtomValues: [[logEntriesAtom, logs]],
      });

      const searchInput = screen.getByPlaceholderText(/search logs/i);
      await user.type(searchInput, "error");

      await waitForAsync(100);

      const findNextButton = screen.getByRole("button", { name: /find next/i });
      expect(findNextButton).not.toBeDisabled();
      await user.click(findNextButton);
      await waitForAsync(50);
      expect(
        screen.getByRole("button", { name: /find next \(1\/1\)/i }),
      ).toBeInTheDocument();
    });

    it("shows match count in Find Next button", async () => {
      const user = userEvent.setup();
      const logs = [
        createLogEntry("error occurred"),
        createLogEntry("another error"),
        createLogEntry("normal message"),
      ];

      renderWithProviders(<DebugConsole />, {
        initialAtomValues: [[logEntriesAtom, logs]],
      });

      const searchInput = screen.getByPlaceholderText(/search logs/i);
      await user.type(searchInput, "error");

      await waitForAsync(100);
      const findNextButton = screen.getByRole("button", { name: /find next/i });
      await user.click(findNextButton);
      await waitForAsync(50);
      expect(
        screen.getByRole("button", { name: /find next \(1\/2\)/i }),
      ).toBeInTheDocument();
    });

    it("performs case-insensitive search", async () => {
      const user = userEvent.setup();
      const logs = [
        createLogEntry("ERROR message"),
        createLogEntry("error message"),
      ];

      renderWithProviders(<DebugConsole />, {
        initialAtomValues: [[logEntriesAtom, logs]],
      });

      const searchInput = screen.getByPlaceholderText(/search logs/i);
      await user.type(searchInput, "error");

      await waitForAsync(100);
      const findNextButton = screen.getByRole("button", { name: /find next/i });
      await user.click(findNextButton);
      await waitForAsync(50);
      expect(
        screen.getByRole("button", { name: /find next \(1\/2\)/i }),
      ).toBeInTheDocument();
    });

    it("resets match index when search term changes", async () => {
      const user = userEvent.setup();
      const logs = [
        createLogEntry("first error"),
        createLogEntry("second error"),
        createLogEntry("some warning"),
      ];

      renderWithProviders(<DebugConsole />, {
        initialAtomValues: [[logEntriesAtom, logs]],
      });

      const searchInput = screen.getByPlaceholderText(/search logs/i);

      // Search for "error" - should show match 1/2
      await user.type(searchInput, "error");
      await waitForAsync(100);
      const findNextButton = screen.getByRole("button", { name: /find next/i });
      await user.click(findNextButton);
      await waitForAsync(50);
      expect(
        screen.getByRole("button", { name: /find next \(1\/2\)/i }),
      ).toBeInTheDocument();

      // Clear and search for "warning" - should reset to 1/1
      await user.clear(searchInput);
      await user.type(searchInput, "warning");
      await waitForAsync(100);
      await user.click(findNextButton);
      await waitForAsync(50);
      expect(
        screen.getByRole("button", { name: /find next \(1\/1\)/i }),
      ).toBeInTheDocument();
    });
  });

  describe("Find Next Navigation", () => {
    it("cycles through matches when clicking Find Next", async () => {
      const user = userEvent.setup();
      const logs = [
        createLogEntry("first error"),
        createLogEntry("second error"),
        createLogEntry("third error"),
      ];

      renderWithProviders(<DebugConsole />, {
        initialAtomValues: [[logEntriesAtom, logs]],
      });

      const searchInput = screen.getByPlaceholderText(/search logs/i);
      await user.type(searchInput, "error");
      await waitForAsync(100);

      const findNextButton = screen.getByRole("button", { name: /find next/i });
      await user.click(findNextButton);
      await waitForAsync(50);
      expect(
        screen.getByRole("button", { name: /find next \(1\/3\)/i }),
      ).toBeInTheDocument();

      // Click to go to match 2
      await user.click(findNextButton);
      await waitForAsync(50);
      expect(
        screen.getByRole("button", { name: /find next \(2\/3\)/i }),
      ).toBeInTheDocument();

      // Click to go to match 3
      await user.click(findNextButton);
      await waitForAsync(50);
      expect(
        screen.getByRole("button", { name: /find next \(3\/3\)/i }),
      ).toBeInTheDocument();

      // Click to wrap around to match 1
      await user.click(findNextButton);
      await waitForAsync(50);
      expect(
        screen.getByRole("button", { name: /find next \(1\/3\)/i }),
      ).toBeInTheDocument();
    });

    it("does nothing when clicking Find Next with no matches", async () => {
      const user = userEvent.setup();
      renderWithProviders(<DebugConsole />);

      const findNextButton = screen.getByRole("button", { name: /find next/i });
      expect(findNextButton).toBeDisabled();

      // Should not throw error
      await user.click(findNextButton);
    });
  });
});
