/**
 * MediaTable Component
 *
 * Displays the media list with thumbnails, titles, progress, and actions.
 * Uses TanStack Table for sorting and row selection.
 */

import type { ColumnDef } from "@tanstack/react-table";
import { MoreHorizontal } from "lucide-react";
import { Checkbox } from "./ui/checkbox";
import { Progress } from "./ui/progress";
import { Button } from "./ui/button";
import thumbnailPlaceholder from "@/assets/thumbnail-placeholder.svg";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { DataTable } from "./data-table";

export interface VideoInfo {
  url: string;
  title: string;
  thumbnail?: string;
  audioOnly: boolean;
  progress: number;
  status: "Pending" | "Downloading" | "Done" | "Error" | "Cancelled";
}

interface MediaTableProps {
  mediaList: VideoInfo[];
  onRemoveItem: (title: string) => void;
  className?: string;
}

/**
 * Creates table column definitions for the media list
 */
function createMediaColumns(
  onRemoveItem: (title: string) => void,
): ColumnDef<VideoInfo>[] {
  return [
    {
      cell: ({ row }) => (
        <Checkbox
          checked={row.getIsSelected()}
          onCheckedChange={(value) => row.toggleSelected(!!value)}
          aria-label="Select row"
        />
      ),
      enableHiding: false,
      enableSorting: false,
      header: ({ table }) => (
        <Checkbox
          checked={
            table.getIsAllPageRowsSelected() ||
            (table.getIsSomePageRowsSelected() && "indeterminate")
          }
          onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
          aria-label="Select all"
        />
      ),
      id: "select",
    },
    {
      accessorKey: "thumbnail",
      cell: ({ row }) => {
        const thumbnail = row.getValue("thumbnail");
        const thumbnailSrc = thumbnail
          ? (thumbnail as string)
          : thumbnailPlaceholder;

        return (
          <img
            className="h-[72px] w-auto"
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
    },
    {
      accessorKey: "title",
      header: () => <div className="text-left">Title</div>,
      cell: ({ row }) => (
        <div className="text-left w-full whitespace-pre-line text-wrap overflow-hidden text-ellipsis">
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
          />
        );
      },
      header: () => <div className="text-center">Audio</div>,
    },
    {
      accessorKey: "progress",
      cell: ({ row }) => {
        return <Progress value={row.getValue("progress")} />;
      },
      header: () => <div className="text-center">Progress</div>,
    },
    {
      accessorKey: "status",
      header: () => <div className="text-right">Status</div>,
    },
    {
      cell: ({ row }) => {
        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="h-8 w-8 p-0">
                <span className="sr-only">Open menu</span>
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>Actions</DropdownMenuLabel>
              <DropdownMenuItem
                onClick={() =>
                  navigator.clipboard.writeText(row.getValue("url"))
                }
              >
                Copy URL
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => onRemoveItem(row.getValue("title"))}
              >
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        );
      },
      id: "actions",
    },
  ];
}

/**
 * Media Table Component
 */
export function MediaTable({
  mediaList,
  onRemoveItem,
  className,
}: MediaTableProps) {
  const columns = createMediaColumns(onRemoveItem);

  return <DataTable className={className} columns={columns} data={mediaList} />;
}
