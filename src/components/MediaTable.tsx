/**
 * MediaTable Component
 *
 * Displays the media list with thumbnails, titles, progress, and actions.
 * Uses TanStack Table with virtual scrolling for performance.
 */

import type { ColumnDef } from "@tanstack/react-table";
import { MoreHorizontal } from "lucide-react";
import { useMemo, useCallback, useRef } from "react";
import { flexRender, getCoreRowModel, useReactTable } from "@tanstack/react-table";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Checkbox } from "./ui/checkbox";
import { Progress } from "./ui/progress";
import { Button } from "./ui/button";
import { Table, TableBody, TableCell, TableRow } from "./ui/table";
import thumbnailPlaceholder from "@/assets/thumbnail-placeholder.svg";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { useAtom } from "jotai";
import { tableRowSelectionAtom } from "@/state/app-atoms";

export interface VideoInfo {
  url: string;
  title: string;
  thumbnail?: string;
  previewUrl?: string;
  audioOnly: boolean;
  progress: number;
  status: "Pending" | "Downloading" | "Done" | "Error" | "Cancelled";
}

interface MediaTableProps {
  mediaList: VideoInfo[];
  onRemoveItem: (title: string) => void;
  className?: string;
}

/** Row height in pixels - matches thumbnail height (80px) + padding (16px) */
const ROW_HEIGHT = 96;

/**
 * Creates table column definitions for the media list
 */
function createMediaColumns(onRemoveItem: (title: string) => void): ColumnDef<VideoInfo>[] {
  return [
    {
      cell: ({ row }) => (
        <Checkbox
          data-testid={`row-${row.id}-select`}
          checked={row.getIsSelected()}
          onCheckedChange={(value) => row.toggleSelected(!!value)}
          aria-label="Select row"
        />
      ),
      enableHiding: false,
      enableSorting: false,
      header: ({ table }) => (
        <Checkbox
          data-testid="table-select-all"
          checked={
            table.getIsAllPageRowsSelected() ||
            (table.getIsSomePageRowsSelected() && "indeterminate")
          }
          onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
          aria-label="Select all"
        />
      ),
      id: "select",
      size: 40,
    },
    {
      accessorKey: "thumbnail",
      cell: ({ row }) => {
        const thumbnail = row.getValue("thumbnail");
        const thumbnailSrc = thumbnail ? (thumbnail as string) : thumbnailPlaceholder;

        return (
          <img
            data-testid={`row-${row.id}-thumb`}
            className="w-[128px] h-[80px] object-cover object-center rounded shrink-0"
            alt="Media thumbnail"
            src={thumbnailSrc}
            loading="lazy"
            onError={(event) => {
              const target = event.currentTarget;
              if (target.src !== thumbnailPlaceholder) {
                target.src = thumbnailPlaceholder;
              }
            }}
          />
        );
      },
      header: () => <div className="text-left">Preview</div>,
      size: 144,
    },
    {
      accessorKey: "title",
      header: () => <div className="text-left">Title</div>,
      cell: ({ row }) => (
        <div
          data-testid={`row-${row.id}-title`}
          className="text-left line-clamp-3 wrap-break-word whitespace-normal"
          title={row.getValue("title")}
        >
          {row.getValue("title")}
        </div>
      ),
    },
    {
      accessorKey: "audioOnly",
      cell: ({ row }) => {
        return (
          <Checkbox
            checked={row.getValue("audioOnly")}
            aria-label="Audio only"
            data-testid={`row-${row.id}-audio`}
          />
        );
      },
      header: () => <div className="text-center">Audio</div>,
      size: 60,
    },
    {
      accessorKey: "progress",
      cell: ({ row }) => {
        return (
          <div className="flex items-center justify-center w-full h-full relative">
            <span
              data-testid={`row-${row.id}-status`}
              className="text-[10px] font-semibold capitalize text-muted-foreground absolute -top-[14px] left-1/2 -translate-x-1/2"
            >
              {row.original.status}
            </span>
            <Progress
              data-testid={`row-${row.id}-progress`}
              value={row.getValue("progress")}
              className="w-full"
            />
          </div>
        );
      },
      header: () => <div className="text-center">Status</div>,
      size: 140,
    },
    {
      cell: ({ row }) => {
        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="h-8 w-8 p-0" data-testid={`row-${row.id}-menu`}>
                <span className="sr-only">Open menu</span>
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>Actions</DropdownMenuLabel>
              <DropdownMenuItem
                data-testid={`row-${row.id}-copy-url`}
                onClick={() => navigator.clipboard.writeText(row.getValue("url"))}
                aria-label="Copy media URL to clipboard"
              >
                Copy URL
              </DropdownMenuItem>
              <DropdownMenuItem
                data-testid={`row-${row.id}-delete`}
                onClick={() => onRemoveItem(row.getValue("title"))}
                aria-label="Remove media item from list"
              >
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        );
      },
      id: "actions",
      size: 48,
    },
  ];
}

/**
 * Media Table Component
 */
export function MediaTable({ mediaList, onRemoveItem, className }: MediaTableProps) {
  const memoizedOnRemoveItem = useCallback(onRemoveItem, [onRemoveItem]);
  const columns = useMemo(() => createMediaColumns(memoizedOnRemoveItem), [memoizedOnRemoveItem]);
  const [rowSelection, setRowSelection] = useAtom(tableRowSelectionAtom);

  const table = useReactTable({
    columns,
    data: mediaList,
    getCoreRowModel: getCoreRowModel(),
    onRowSelectionChange: setRowSelection,
    state: {
      rowSelection,
    },
  });

  const { rows } = table.getRowModel();

  // Ref for the scrollable container
  const tableContainerRef = useRef<HTMLDivElement>(null);

  // Virtual row renderer - only renders visible rows + overscan
  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    estimateSize: () => ROW_HEIGHT,
    getScrollElement: () => tableContainerRef.current,
    overscan: 5, // Render 5 extra rows above/below viewport for smooth scrolling
  });

  return (
    <div
      className={cn(
        "rounded-md border border-sidebar-ring shadow-md grad-background flex flex-col",
        className,
      )}
    >
      <div className="shrink-0 bg-primary rounded-t-md">
        {table.getHeaderGroups().map((headerGroup) => (
          <div key={headerGroup.id} className="h-10 flex items-center">
            {headerGroup.headers.map((header) => {
              const isFlexColumn = header.id === "title";
              return (
                <div
                  key={header.id}
                  className={`text-white font-medium px-2 ${isFlexColumn ? "flex-1 min-w-0" : "shrink-0"}`}
                  style={isFlexColumn ? undefined : { width: header.getSize() }}
                >
                  {header.isPlaceholder
                    ? null
                    : flexRender(header.column.columnDef.header, header.getContext())}
                </div>
              );
            })}
          </div>
        ))}
      </div>

      {/* Virtualized scrollable body */}
      <div
        ref={tableContainerRef}
        className="overflow-y-auto flex-1 min-h-0"
        data-testid="virtual-scroll-container"
      >
        <Table>
          <TableBody
            style={{
              height: `${rowVirtualizer.getTotalSize()}px`,
              position: "relative",
            }}
          >
            {rows.length > 0
              ? (() => {
                  const virtualItems = rowVirtualizer.getVirtualItems();
                  // Fallback: render all rows when virtualizer returns empty (e.g., in JSDOM tests)
                  const itemsToRender =
                    virtualItems.length > 0
                      ? virtualItems
                      : rows.map((_, index) => ({
                          index,
                          start: index * ROW_HEIGHT,
                          size: ROW_HEIGHT,
                          key: index,
                        }));

                  return itemsToRender.map((virtualRow) => {
                    const row = rows[virtualRow.index];
                    if (!row) return null;
                    return (
                      <TableRow
                        className="bg-background absolute w-full flex items-center"
                        key={row.id}
                        data-testid={`row-${row.id}`}
                        data-state={row.getIsSelected() && "selected"}
                        data-index={virtualRow.index}
                        onContextMenu={() => {
                          // Right-click should target the row under the cursor so selection-aware actions enable
                          if (!row.getIsSelected()) {
                            setRowSelection({ [row.id]: true });
                          }
                        }}
                        style={{
                          height: `${virtualRow.size}px`,
                          transform: `translateY(${virtualRow.start}px)`,
                        }}
                      >
                        {row.getVisibleCells().map((cell) => {
                          const isFlexColumn = cell.column.id === "title";
                          return (
                            <TableCell
                              key={cell.id}
                              className={`flex items-center px-2 ${isFlexColumn ? "flex-1 min-w-0" : "shrink-0"}`}
                              style={isFlexColumn ? undefined : { width: cell.column.getSize() }}
                            >
                              {flexRender(cell.column.columnDef.cell, cell.getContext())}
                            </TableCell>
                          );
                        })}
                      </TableRow>
                    );
                  });
                })()
              : null}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
