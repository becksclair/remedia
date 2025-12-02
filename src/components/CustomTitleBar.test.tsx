import { describe, it, expect, beforeEach, afterEach, vi } from "bun:test";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { CustomTitleBar } from "./CustomTitleBar";

// Mock the Tauri API
const mockGetWslWindowCloseBehavior = vi.fn();
const mockQuit = vi.fn();

vi.mock("@/lib/tauri-api", () => ({
  tauriApi: {
    commands: {
      getWslWindowCloseBehavior: mockGetWslWindowCloseBehavior,
      quit: mockQuit,
    },
  },
}));

// Mock the Window API
const mockWindow = {
  minimize: vi.fn(),
  toggleMaximize: vi.fn(),
  close: vi.fn(),
};

vi.mock("@tauri-apps/api/window", () => ({
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
    expect(mockWindow.close).toHaveBeenCalled();
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
    expect(mockWindow.close).toHaveBeenCalled();
    expect(mockQuit).not.toHaveBeenCalled();
  });

  it("should fallback to window.close if quit fails in WSL2", async () => {
    // Mock WSL2 detection
    mockGetWslWindowCloseBehavior.mockResolvedValue("wsl2");
    
    // Mock quit failure
    mockQuit.mockRejectedValue(new Error("Quit failed"));

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
  });

  it("should handle WSL detection errors gracefully", async () => {
    // Mock WSL detection failure
    mockGetWslWindowCloseBehavior.mockRejectedValue(
      new Error("Detection failed")
    );

    const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    render(<CustomTitleBar />);

    // Wait for WSL detection to fail
    await waitFor(() => {
      expect(consoleSpy).toHaveBeenCalledWith(
        "Failed to detect WSL environment:",
        expect.any(Error)
      );
    });

    // Find and click the close button - should default to window.close
    const closeButton = screen.getByTitle("Close");
    fireEvent.click(closeButton);

    // Should use window.close as fallback
    expect(mockWindow.close).toHaveBeenCalled();
    expect(mockQuit).not.toHaveBeenCalled();

    consoleSpy.mockRestore();
  });

  it("should have proper accessibility attributes", async () => {
    mockGetWslWindowCloseBehavior.mockResolvedValue("native");

    render(<CustomTitleBar />);

    // Check for proper ARIA labels
    expect(screen.getByLabelText("Minimize window")).toBeInTheDocument();
    expect(screen.getByLabelText("Toggle maximize window")).toBeInTheDocument();
    expect(screen.getByLabelText("Close window")).toBeInTheDocument();

    // Check for title attributes
    expect(screen.getByTitle("Minimize")).toBeInTheDocument();
    expect(screen.getByTitle("Maximize")).toBeInTheDocument();
    expect(screen.getByTitle("Close")).toBeInTheDocument();
  });
});