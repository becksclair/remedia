import { describe, it, expect, beforeEach, mock, vi } from "bun:test";
import { render, screen } from "@testing-library/react";
import { TestingLibraryMatchers } from "@testing-library/jest-dom/matchers";

// Extend Bun's expect with jest-dom matchers
declare module "bun:test" {
  interface Matchers<T> extends TestingLibraryMatchers<typeof expect.stringContaining, T> {}
}

import { DownloadControls } from "./DownloadControls";

describe("DownloadControls (Bun)", () => {
  const mockHandlers = {
    onDownload: mock(() => {}),
    onCancel: mock(() => {}),
    onPreview: mock(() => {}),
    onSettings: mock(() => {}),
    onQuit: mock(() => {}),
  };

  beforeEach(() => {
    // Clear localStorage to ensure clean state for atomWithStorage
    localStorage.clear();
    vi.clearAllMocks();
    // Reset mocks before each test
    Object.values(mockHandlers).forEach((fn) => fn.mockClear?.());
  });

  it("renders download button when not downloading", () => {
    render(
      <DownloadControls
        globalProgress={0}
        globalDownloading={false}
        onDownload={mockHandlers.onDownload}
        onCancel={mockHandlers.onCancel}
        onPreview={mockHandlers.onPreview}
        onSettings={mockHandlers.onSettings}
        onQuit={mockHandlers.onQuit}
      />,
    );

    expect(screen.getByText("Download")).toBeInTheDocument();
    expect(screen.queryByText("Cancel")).not.toBeInTheDocument();
  });

  it("shows cancel button when downloading", () => {
    render(
      <DownloadControls
        globalProgress={45}
        globalDownloading={true}
        onDownload={mockHandlers.onDownload}
        onCancel={mockHandlers.onCancel}
        onPreview={mockHandlers.onPreview}
        onSettings={mockHandlers.onSettings}
        onQuit={mockHandlers.onQuit}
      />,
    );

    expect(screen.getByText("Cancel")).toBeInTheDocument();
    expect(screen.getByText("Download")).toBeDisabled();
  });

  it("displays download stats when completed and total counts are provided", () => {
    render(
      <DownloadControls
        globalProgress={75}
        globalDownloading={false}
        completedCount={3}
        totalCount={5}
        onDownload={mockHandlers.onDownload}
        onCancel={mockHandlers.onCancel}
        onPreview={mockHandlers.onPreview}
        onSettings={mockHandlers.onSettings}
        onQuit={mockHandlers.onQuit}
      />,
    );

    expect(screen.getByTestId("download-stats")).toHaveTextContent("Downloaded: 3 / 5");
  });

  it("displays queue stats when queued and active counts are provided", () => {
    render(
      <DownloadControls
        globalProgress={25}
        globalDownloading={true}
        queuedCount={2}
        activeCount={1}
        maxConcurrent={3}
        onDownload={mockHandlers.onDownload}
        onCancel={mockHandlers.onCancel}
        onPreview={mockHandlers.onPreview}
        onSettings={mockHandlers.onSettings}
        onQuit={mockHandlers.onQuit}
      />,
    );

    expect(screen.getByTestId("queue-stats")).toHaveTextContent(
      "Queue: 2 queued, 1 active (limit 3)",
    );
  });

  it("calls onDownload when download button is clicked", () => {
    render(
      <DownloadControls
        globalProgress={0}
        globalDownloading={false}
        onDownload={mockHandlers.onDownload}
        onCancel={mockHandlers.onCancel}
        onPreview={mockHandlers.onPreview}
        onSettings={mockHandlers.onSettings}
        onQuit={mockHandlers.onQuit}
      />,
    );

    const downloadButton = screen.getByText("Download");
    downloadButton.click();

    expect(mockHandlers.onDownload).toHaveBeenCalled();
  });
});
