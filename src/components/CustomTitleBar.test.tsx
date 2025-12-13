import { describe, it, expect, beforeEach, afterEach, vi } from "bun:test";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { CustomTitleBar } from "./CustomTitleBar";

// Mock the Tauri API
const mockGetWslWindowCloseBehavior = vi.fn();
const mockQuit = vi.fn();

void vi.mock("@/lib/tauri-api", () => {
  return {
    tauriApi: {
      commands: {
        getWslWindowCloseBehavior: mockGetWslWindowCloseBehavior,
        quit: mockQuit,
      },
    },
  };
});

// Mock the Window API
const mockWindow = {
  minimize: vi.fn(),
  toggleMaximize: vi.fn(),
  close: vi.fn(),
};

void vi.mock("@tauri-apps/api/window", () => ({
  Window: {
    getCurrent: vi.fn(() => mockWindow),
  },
}));

describe("CustomTitleBar WSL2 Window Closing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should detect WSL2 environment and use quit command", async () => {
    // Mock WSL2 detection
    mockGetWslWindowCloseBehavior.mockResolvedValue("wsl2");

    render(<CustomTitleBar />);

    // Wait for WSL detection to complete
    await waitFor(() => {
      expect(mockGetWslWindowCloseBehavior).toHaveBeenCalled();
    });

    // Find and click the close button
    const closeButton = screen.getByTitle("Close");
    expect(closeButton).toBeInTheDocument();

    fireEvent.click(closeButton);

    // Should call quit instead of close for WSL2
    await waitFor(() => {
      expect(mockQuit).toHaveBeenCalled();
    });
  });

  it("should use window.close for native environments", async () => {
    // Mock native environment
    mockGetWslWindowCloseBehavior.mockResolvedValue("native");

    render(<CustomTitleBar />);

    // Wait for WSL detection to complete
    await waitFor(() => {
      expect(mockGetWslWindowCloseBehavior).toHaveBeenCalled();
    });

    // Find and click the close button
    const closeButton = screen.getByTitle("Close");
    fireEvent.click(closeButton);

    // Should call window.close for native environments
    await waitFor(() => {
      expect(mockWindow.close).toHaveBeenCalled();
    });
    expect(mockQuit).not.toHaveBeenCalled();
  });

  it("should use window.close for WSL1 environments", async () => {
    // Mock WSL1 environment
    mockGetWslWindowCloseBehavior.mockResolvedValue("wsl1");

    render(<CustomTitleBar />);

    // Wait for WSL detection to complete
    await waitFor(() => {
      expect(mockGetWslWindowCloseBehavior).toHaveBeenCalled();
    });

    // Find and click the close button
    const closeButton = screen.getByTitle("Close");
    fireEvent.click(closeButton);

    // Should call window.close for WSL1 environments
    await waitFor(() => {
      expect(mockWindow.close).toHaveBeenCalled();
    });
    expect(mockQuit).not.toHaveBeenCalled();
  });

  it("should fallback to window.close if quit fails in WSL2", async () => {
    // Mock WSL2 detection
    mockGetWslWindowCloseBehavior.mockResolvedValue("wsl2");

    // Mock quit failure
    mockQuit.mockRejectedValue(new Error("Quit failed"));
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    render(<CustomTitleBar />);

    // Wait for WSL detection to complete
    await waitFor(() => {
      expect(mockGetWslWindowCloseBehavior).toHaveBeenCalled();
    });

    // Find and click the close button
    const closeButton = screen.getByTitle("Close");
    fireEvent.click(closeButton);

    // Should try quit first, then fallback to close
    await waitFor(() => {
      expect(mockQuit).toHaveBeenCalled();
      expect(mockWindow.close).toHaveBeenCalled();
    });

    warnSpy.mockRestore();
  });

  it("should keep close button disabled when WSL detection fails", async () => {
    // Mock WSL detection failure
    mockGetWslWindowCloseBehavior.mockRejectedValue(new Error("Detection failed"));

    const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    render(<CustomTitleBar />);

    // Wait for WSL detection to fail
    await waitFor(() => {
      expect(consoleSpy).toHaveBeenCalledWith(
        "Failed to detect WSL environment:",
        expect.any(Error),
      );
    });

    // Find the close button - should be disabled when WSL detection fails
    const closeButton = screen.getByTitle("Initializing...");
    expect(closeButton).toBeDisabled();
    expect(closeButton).toHaveAttribute("aria-label", "Initializing, please wait...");

    // Clicking the disabled button should not trigger any close behavior
    fireEvent.click(closeButton);

    // Should NOT call window.close or quit since button is disabled
    expect(mockWindow.close).not.toHaveBeenCalled();
    expect(mockQuit).not.toHaveBeenCalled();

    consoleSpy.mockRestore();
  });

  it("should have proper accessibility attributes", async () => {
    mockGetWslWindowCloseBehavior.mockResolvedValue("native");

    render(<CustomTitleBar />);

    // Wait for WSL detection to complete
    await waitFor(() => {
      expect(mockGetWslWindowCloseBehavior).toHaveBeenCalled();
    });

    // Check for proper ARIA labels
    expect(screen.getByLabelText("Minimize window")).toBeInTheDocument();
    expect(screen.getByLabelText("Toggle maximize window")).toBeInTheDocument();
    expect(screen.getByLabelText("Close window")).toBeInTheDocument();

    // Check for title attributes
    expect(screen.getByTitle("Minimize")).toBeInTheDocument();
    expect(screen.getByTitle("Maximize")).toBeInTheDocument();
    expect(screen.getByTitle("Close")).toBeInTheDocument();
  });

  it("should call minimize when minimize button is clicked", async () => {
    mockGetWslWindowCloseBehavior.mockResolvedValue("native");

    render(<CustomTitleBar />);

    await waitFor(() => {
      expect(mockGetWslWindowCloseBehavior).toHaveBeenCalled();
    });

    const minimizeButton = screen.getByTitle("Minimize");
    fireEvent.click(minimizeButton);

    expect(mockWindow.minimize).toHaveBeenCalled();
  });

  it("should call toggleMaximize when maximize button is clicked", async () => {
    mockGetWslWindowCloseBehavior.mockResolvedValue("native");

    render(<CustomTitleBar />);

    await waitFor(() => {
      expect(mockGetWslWindowCloseBehavior).toHaveBeenCalled();
    });

    const maximizeButton = screen.getByTitle("Maximize");
    fireEvent.click(maximizeButton);

    expect(mockWindow.toggleMaximize).toHaveBeenCalled();
  });
});
