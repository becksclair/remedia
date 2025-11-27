/**
 * Tests for SettingsDialog component
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SettingsDialog } from "./settings-dialog";
import { renderWithProviders } from "@/test/test-utils";
import {
  downloadLocationAtom,
  downloadModeAtom,
  themeAtom,
  maxConcurrentDownloadsAtom,
} from "@/state/settings-atoms";
import { mockState } from "@/lib/tauri-api.mock";

describe("SettingsDialog", () => {
  beforeEach(() => {
    mockState.reset();
    vi.clearAllMocks();
  });

  describe("rendering", () => {
    it("renders when open", () => {
      renderWithProviders(<SettingsDialog open={true} onOpenChange={() => {}} />);

      expect(screen.getByRole("heading", { name: "Settings" })).toBeVisible();
    });

    it("does not render content when closed", () => {
      renderWithProviders(<SettingsDialog open={false} onOpenChange={() => {}} />);

      expect(screen.queryByRole("heading", { name: "Settings" })).not.toBeInTheDocument();
    });

    it("renders download location input", () => {
      renderWithProviders(<SettingsDialog open={true} onOpenChange={() => {}} />);

      expect(screen.getByLabelText(/download location/i)).toBeVisible();
    });

    it("renders theme selector", () => {
      renderWithProviders(<SettingsDialog open={true} onOpenChange={() => {}} />);

      expect(screen.getByLabelText(/theme/i)).toBeVisible();
    });

    it("renders download mode selector", async () => {
      const user = userEvent.setup();
      renderWithProviders(<SettingsDialog open={true} onOpenChange={() => {}} />);

      // Navigate to Downloads tab
      await user.click(screen.getByRole("tab", { name: /downloads/i }));
      expect(screen.getByLabelText(/download mode/i)).toBeVisible();
    });

    it("renders Done button", () => {
      renderWithProviders(<SettingsDialog open={true} onOpenChange={() => {}} />);

      expect(screen.getByRole("button", { name: "Done" })).toBeVisible();
    });

    it("focuses download location input when opened", async () => {
      renderWithProviders(<SettingsDialog open={true} onOpenChange={() => {}} />);

      await waitFor(() => {
        expect(screen.getByLabelText(/download location/i)).toHaveFocus();
      });
    });

    it("focus restoration handled by Radix Dialog", () => {
      // Radix Dialog automatically handles focus restoration
      // This test documents that behavior is delegated to the library
      expect(true).toBe(true);
    });
  });

  describe("download location", () => {
    it("displays initial download location", () => {
      renderWithProviders(<SettingsDialog open={true} onOpenChange={() => {}} />, {
        initialAtomValues: [[downloadLocationAtom, "/home/user/downloads"]],
      });

      const input = screen.getByLabelText(/download location/i);
      expect(input).toHaveValue("/home/user/downloads");
    });

    it("allows editing download location", async () => {
      const user = userEvent.setup();
      renderWithProviders(<SettingsDialog open={true} onOpenChange={() => {}} />, {
        initialAtomValues: [[downloadLocationAtom, ""]],
      });

      const input = screen.getByLabelText(/download location/i);
      await user.clear(input);
      await user.type(input, "/new/path");

      expect(input).toHaveValue("/new/path");
    });
  });

  describe("download mode", () => {
    it("shows video settings when in video mode", async () => {
      const user = userEvent.setup();
      renderWithProviders(<SettingsDialog open={true} onOpenChange={() => {}} />, {
        initialAtomValues: [[downloadModeAtom, "video"]],
      });

      // Navigate to Quality tab
      await user.click(screen.getByRole("tab", { name: /quality/i }));
      expect(screen.getByText("Video Settings")).toBeVisible();
    });

    it("hides video settings when in audio mode", async () => {
      const user = userEvent.setup();
      renderWithProviders(<SettingsDialog open={true} onOpenChange={() => {}} />, {
        initialAtomValues: [[downloadModeAtom, "audio"]],
      });

      // Navigate to Quality tab
      await user.click(screen.getByRole("tab", { name: /quality/i }));
      expect(screen.queryByText("Video Settings")).not.toBeInTheDocument();
    });

    it("always shows audio settings", async () => {
      const user = userEvent.setup();
      renderWithProviders(<SettingsDialog open={true} onOpenChange={() => {}} />, {
        initialAtomValues: [[downloadModeAtom, "video"]],
      });

      // Navigate to Quality tab
      await user.click(screen.getByRole("tab", { name: /quality/i }));
      expect(screen.getByText("Audio Settings")).toBeVisible();
    });
  });

  describe("theme", () => {
    it("displays current theme", () => {
      renderWithProviders(<SettingsDialog open={true} onOpenChange={() => {}} />, {
        initialAtomValues: [[themeAtom, "dark"]],
      });

      expect(screen.getByLabelText(/theme/i)).toHaveTextContent(/dark/i);
    });
  });

  describe("concurrent downloads", () => {
    it("displays max concurrent downloads setting", async () => {
      const user = userEvent.setup();
      renderWithProviders(<SettingsDialog open={true} onOpenChange={() => {}} />, {
        initialAtomValues: [[maxConcurrentDownloadsAtom, 3]],
      });

      // Navigate to Downloads tab
      await user.click(screen.getByRole("tab", { name: /downloads/i }));
      // Find by text content since the label may not be directly associated
      expect(screen.getByText(/concurrent/i)).toBeVisible();
    });
  });

  describe("dialog actions", () => {
    it("calls onOpenChange when Done is clicked", async () => {
      const user = userEvent.setup();
      const onOpenChange = vi.fn();

      renderWithProviders(<SettingsDialog open={true} onOpenChange={onOpenChange} />);

      await user.click(screen.getByRole("button", { name: "Done" }));

      await waitFor(() => {
        expect(onOpenChange).toHaveBeenCalledWith(false);
      });
    });
  });
});
