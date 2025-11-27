import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  renderWithProviders,
  screen,
  userEvent,
  createMockMediaItem,
} from "@/test/test-utils";
import { MediaTable, type VideoInfo } from "./MediaTable";

describe("MediaTable", () => {
  const mockOnRemoveItem = vi.fn();

  beforeEach(() => {
    mockOnRemoveItem.mockClear();
  });

  describe("Initial Render", () => {
    it("renders empty table when no media items", () => {
      renderWithProviders(
        <MediaTable mediaList={[]} onRemoveItem={mockOnRemoveItem} />,
      );

      // Table should exist
      const tables = screen.getAllByRole("table");
      expect(tables.length).toBeGreaterThanOrEqual(1);
      // No data rows should exist (header is rendered as divs, not tr elements)
      expect(screen.queryAllByRole("row")).toHaveLength(0);
    });

    it("renders table headers", () => {
      renderWithProviders(
        <MediaTable mediaList={[]} onRemoveItem={mockOnRemoveItem} />,
      );

      expect(screen.getByText("Preview")).toBeInTheDocument();
      expect(screen.getByText("Title")).toBeInTheDocument();
      expect(screen.getByText("Audio")).toBeInTheDocument();
      // Progress column header is labeled "Status" (shows status text + progress bar)
      expect(screen.getByText("Status")).toBeInTheDocument();
    });

    it("renders select all checkbox in header", () => {
      renderWithProviders(
        <MediaTable mediaList={[]} onRemoveItem={mockOnRemoveItem} />,
      );

      expect(screen.getByTestId("table-select-all")).toBeInTheDocument();
    });
  });

  describe("Media Item Display", () => {
    it("renders media items with title", () => {
      const mediaList: VideoInfo[] = [
        createMockMediaItem("https://example.com/video1", {
          title: "Test Video 1",
        }),
        createMockMediaItem("https://example.com/video2", {
          title: "Test Video 2",
        }),
      ];

      renderWithProviders(
        <MediaTable mediaList={mediaList} onRemoveItem={mockOnRemoveItem} />,
      );

      expect(screen.getByText("Test Video 1")).toBeInTheDocument();
      expect(screen.getByText("Test Video 2")).toBeInTheDocument();
    });

    it("displays correct status for each item", () => {
      const mediaList: VideoInfo[] = [
        createMockMediaItem("https://example.com/1", {
          title: "Pending Item",
          status: "Pending",
        }),
        createMockMediaItem("https://example.com/2", {
          title: "Downloading Item",
          status: "Downloading",
        }),
        createMockMediaItem("https://example.com/3", {
          title: "Done Item",
          status: "Done",
        }),
      ];

      renderWithProviders(
        <MediaTable mediaList={mediaList} onRemoveItem={mockOnRemoveItem} />,
      );

      expect(screen.getByTestId("row-0-status")).toHaveTextContent("Pending");
      expect(screen.getByTestId("row-1-status")).toHaveTextContent(
        "Downloading",
      );
      expect(screen.getByTestId("row-2-status")).toHaveTextContent("Done");
    });

    it("displays progress for each item", () => {
      const mediaList: VideoInfo[] = [
        createMockMediaItem("https://example.com/1", {
          title: "Item 1",
          progress: 0,
        }),
        createMockMediaItem("https://example.com/2", {
          title: "Item 2",
          progress: 50,
        }),
        createMockMediaItem("https://example.com/3", {
          title: "Item 3",
          progress: 100,
        }),
      ];

      renderWithProviders(
        <MediaTable mediaList={mediaList} onRemoveItem={mockOnRemoveItem} />,
      );

      expect(screen.getByTestId("row-0-progress")).toBeInTheDocument();
      expect(screen.getByTestId("row-1-progress")).toBeInTheDocument();
      expect(screen.getByTestId("row-2-progress")).toBeInTheDocument();
    });

    it("shows audio-only checkbox state", () => {
      const mediaList: VideoInfo[] = [
        createMockMediaItem("https://example.com/1", {
          title: "Video Item",
          audioOnly: false,
        }),
        createMockMediaItem("https://example.com/2", {
          title: "Audio Item",
          audioOnly: true,
        }),
      ];

      renderWithProviders(
        <MediaTable mediaList={mediaList} onRemoveItem={mockOnRemoveItem} />,
      );

      const videoAudioCheckbox = screen.getByTestId("row-0-audio");
      const audioOnlyCheckbox = screen.getByTestId("row-1-audio");

      expect(videoAudioCheckbox).not.toBeChecked();
      expect(audioOnlyCheckbox).toBeChecked();
    });
  });

  describe("Thumbnail Display", () => {
    it("displays thumbnail when provided", () => {
      const mediaList: VideoInfo[] = [
        createMockMediaItem("https://example.com/video", {
          title: "Video with thumb",
          thumbnail: "https://example.com/thumb.jpg",
        }),
      ];

      renderWithProviders(
        <MediaTable mediaList={mediaList} onRemoveItem={mockOnRemoveItem} />,
      );

      const thumbnail = screen.getByTestId("row-0-thumb");
      expect(thumbnail).toHaveAttribute("src", "https://example.com/thumb.jpg");
    });

    it("displays placeholder when no thumbnail", () => {
      const mediaList: VideoInfo[] = [
        createMockMediaItem("https://example.com/video", {
          title: "Video without thumb",
          thumbnail: "",
        }),
      ];

      renderWithProviders(
        <MediaTable mediaList={mediaList} onRemoveItem={mockOnRemoveItem} />,
      );

      const thumbnail = screen.getByTestId("row-0-thumb");
      const src = thumbnail.getAttribute("src") || "";
      expect(
        src.startsWith("data:image/svg+xml") ||
          src.includes("thumbnail-placeholder"),
      ).toBe(true);
    });
  });

  describe("Row Selection", () => {
    it("renders row selection checkbox for each item", () => {
      const mediaList: VideoInfo[] = [
        createMockMediaItem("https://example.com/1", { title: "Item 1" }),
        createMockMediaItem("https://example.com/2", { title: "Item 2" }),
      ];

      renderWithProviders(
        <MediaTable mediaList={mediaList} onRemoveItem={mockOnRemoveItem} />,
      );

      expect(screen.getByTestId("row-0-select")).toBeInTheDocument();
      expect(screen.getByTestId("row-1-select")).toBeInTheDocument();
    });

    it("allows selecting individual rows", async () => {
      const user = userEvent.setup();
      const mediaList: VideoInfo[] = [
        createMockMediaItem("https://example.com/1", { title: "Item 1" }),
        createMockMediaItem("https://example.com/2", { title: "Item 2" }),
      ];

      renderWithProviders(
        <MediaTable mediaList={mediaList} onRemoveItem={mockOnRemoveItem} />,
      );

      const row0Checkbox = screen.getByTestId("row-0-select");
      await user.click(row0Checkbox);

      expect(row0Checkbox).toBeChecked();
      expect(screen.getByTestId("row-1-select")).not.toBeChecked();
    });

    it("allows selecting all rows", async () => {
      const user = userEvent.setup();
      const mediaList: VideoInfo[] = [
        createMockMediaItem("https://example.com/1", { title: "Item 1" }),
        createMockMediaItem("https://example.com/2", { title: "Item 2" }),
      ];

      renderWithProviders(
        <MediaTable mediaList={mediaList} onRemoveItem={mockOnRemoveItem} />,
      );

      const selectAllCheckbox = screen.getByTestId("table-select-all");
      await user.click(selectAllCheckbox);

      expect(screen.getByTestId("row-0-select")).toBeChecked();
      expect(screen.getByTestId("row-1-select")).toBeChecked();
    });
  });

  describe("Row Actions", () => {
    it("renders action menu button for each row", () => {
      const mediaList: VideoInfo[] = [
        createMockMediaItem("https://example.com/1", { title: "Item 1" }),
      ];

      renderWithProviders(
        <MediaTable mediaList={mediaList} onRemoveItem={mockOnRemoveItem} />,
      );

      expect(screen.getByTestId("row-0-menu")).toBeInTheDocument();
    });

    it("opens action menu when clicked", async () => {
      const user = userEvent.setup();
      const mediaList: VideoInfo[] = [
        createMockMediaItem("https://example.com/1", { title: "Item 1" }),
      ];

      renderWithProviders(
        <MediaTable mediaList={mediaList} onRemoveItem={mockOnRemoveItem} />,
      );

      await user.click(screen.getByTestId("row-0-menu"));

      expect(screen.getByText("Actions")).toBeInTheDocument();
      expect(screen.getByText("Copy URL")).toBeInTheDocument();
      expect(screen.getByText("Delete")).toBeInTheDocument();
    });

    it("calls onRemoveItem when delete is clicked", async () => {
      const user = userEvent.setup();
      const mediaList: VideoInfo[] = [
        createMockMediaItem("https://example.com/1", { title: "Test Item" }),
      ];

      renderWithProviders(
        <MediaTable mediaList={mediaList} onRemoveItem={mockOnRemoveItem} />,
      );

      await user.click(screen.getByTestId("row-0-menu"));
      await user.click(screen.getByTestId("row-0-delete"));

      expect(mockOnRemoveItem).toHaveBeenCalledWith("Test Item");
    });
  });
});
