import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderWithProviders, screen, userEvent } from "@/test/test-utils";
import { DownloadControls } from "./DownloadControls";

describe("DownloadControls", () => {
  const mockHandlers = {
    onDownload: vi.fn(),
    onCancel: vi.fn(),
    onPreview: vi.fn(),
    onSettings: vi.fn(),
    onQuit: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Initial Render", () => {
    it("renders all control buttons", () => {
      renderWithProviders(
        <DownloadControls globalProgress={0} globalDownloading={false} {...mockHandlers} />,
      );

      expect(screen.getByTestId("download-all")).toBeInTheDocument();
      expect(screen.getByTestId("preview-selected")).toBeInTheDocument();
      expect(screen.getByTestId("open-settings")).toBeInTheDocument();
      expect(screen.getByTestId("quit-app")).toBeInTheDocument();
    });

    it("renders global progress bar", () => {
      renderWithProviders(
        <DownloadControls globalProgress={50} globalDownloading={false} {...mockHandlers} />,
      );

      const progressBar = screen.getByTestId("global-progress");
      expect(progressBar).toBeInTheDocument();
    });

    it("has correct aria labels for accessibility", () => {
      renderWithProviders(
        <DownloadControls globalProgress={0} globalDownloading={false} {...mockHandlers} />,
      );

      expect(screen.getByRole("button", { name: "Start download" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Preview selected media" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Open settings" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Quit application" })).toBeInTheDocument();
    });
  });

  describe("Download Button State", () => {
    it("download button is enabled when not downloading", () => {
      renderWithProviders(
        <DownloadControls globalProgress={0} globalDownloading={false} {...mockHandlers} />,
      );

      const downloadButton = screen.getByTestId("download-all");
      expect(downloadButton).not.toBeDisabled();
    });

    it("download button is disabled when downloading", () => {
      renderWithProviders(
        <DownloadControls globalProgress={50} globalDownloading={true} {...mockHandlers} />,
      );

      const downloadButton = screen.getByTestId("download-all");
      expect(downloadButton).toBeDisabled();
    });
  });

  describe("Cancel Button Visibility", () => {
    it("cancel button is hidden when not downloading", () => {
      renderWithProviders(
        <DownloadControls globalProgress={0} globalDownloading={false} {...mockHandlers} />,
      );

      expect(screen.queryByTestId("cancel-all")).not.toBeInTheDocument();
    });

    it("cancel button is visible when downloading", () => {
      renderWithProviders(
        <DownloadControls globalProgress={50} globalDownloading={true} {...mockHandlers} />,
      );

      expect(screen.getByTestId("cancel-all")).toBeInTheDocument();
    });

    it("cancel button has correct aria label", () => {
      renderWithProviders(
        <DownloadControls globalProgress={50} globalDownloading={true} {...mockHandlers} />,
      );

      expect(screen.getByRole("button", { name: "Cancel all downloads" })).toBeInTheDocument();
    });
  });

  describe("Button Click Handlers", () => {
    it("calls onDownload when download button clicked", async () => {
      const user = userEvent.setup();
      renderWithProviders(
        <DownloadControls globalProgress={0} globalDownloading={false} {...mockHandlers} />,
      );

      await user.click(screen.getByTestId("download-all"));

      expect(mockHandlers.onDownload).toHaveBeenCalledTimes(1);
    });

    it("calls onCancel when cancel button clicked", async () => {
      const user = userEvent.setup();
      renderWithProviders(
        <DownloadControls globalProgress={50} globalDownloading={true} {...mockHandlers} />,
      );

      await user.click(screen.getByTestId("cancel-all"));

      expect(mockHandlers.onCancel).toHaveBeenCalledTimes(1);
    });

    it("calls onPreview when preview button clicked", async () => {
      const user = userEvent.setup();
      renderWithProviders(
        <DownloadControls globalProgress={0} globalDownloading={false} {...mockHandlers} />,
      );

      await user.click(screen.getByTestId("preview-selected"));

      expect(mockHandlers.onPreview).toHaveBeenCalledTimes(1);
    });

    it("calls onSettings when settings button clicked", async () => {
      const user = userEvent.setup();
      renderWithProviders(
        <DownloadControls globalProgress={0} globalDownloading={false} {...mockHandlers} />,
      );

      await user.click(screen.getByTestId("open-settings"));

      expect(mockHandlers.onSettings).toHaveBeenCalledTimes(1);
    });

    it("calls onQuit when quit button clicked", async () => {
      const user = userEvent.setup();
      renderWithProviders(
        <DownloadControls globalProgress={0} globalDownloading={false} {...mockHandlers} />,
      );

      await user.click(screen.getByTestId("quit-app"));

      expect(mockHandlers.onQuit).toHaveBeenCalledTimes(1);
    });
  });

  describe("Progress States", () => {
    it("renders with 0% progress", () => {
      renderWithProviders(
        <DownloadControls globalProgress={0} globalDownloading={false} {...mockHandlers} />,
      );

      const progressBar = screen.getByTestId("global-progress");
      expect(progressBar).toBeInTheDocument();
      // Progress indicator should be at 0%
      const indicator = progressBar.querySelector('[data-slot="progress-indicator"]');
      expect(indicator).toHaveStyle({ transform: "translateX(-100%)" });
    });

    it("renders with 50% progress", () => {
      renderWithProviders(
        <DownloadControls globalProgress={50} globalDownloading={true} {...mockHandlers} />,
      );

      const progressBar = screen.getByTestId("global-progress");
      expect(progressBar).toBeInTheDocument();
      // Progress indicator should be at 50%
      const indicator = progressBar.querySelector('[data-slot="progress-indicator"]');
      expect(indicator).toHaveStyle({ transform: "translateX(-50%)" });
    });

    it("renders with 100% progress", () => {
      renderWithProviders(
        <DownloadControls globalProgress={100} globalDownloading={false} {...mockHandlers} />,
      );

      const progressBar = screen.getByTestId("global-progress");
      expect(progressBar).toBeInTheDocument();
      // Progress indicator should be at 100%
      const indicator = progressBar.querySelector('[data-slot="progress-indicator"]');
      expect(indicator).toHaveStyle({ transform: "translateX(-0%)" });
    });

    it("renders download stats when provided", () => {
      renderWithProviders(
        <DownloadControls
          globalProgress={10}
          globalDownloading={false}
          completedCount={2}
          totalCount={5}
          {...mockHandlers}
        />,
      );

      expect(screen.getByTestId("download-stats")).toHaveTextContent("Downloaded: 2 / 5");
    });
  });
});
