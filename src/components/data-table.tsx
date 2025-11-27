import { useRef } from "react";
import { type ColumnDef, flexRender, getCoreRowModel, useReactTable } from "@tanstack/react-table";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Table, TableBody, TableCell, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { useAtom } from "jotai";
import { tableRowSelectionAtom } from "@/state/app-atoms";

/** Row height in pixels - matches thumbnail height (80px) + padding (16px) */
const ROW_HEIGHT = 96;

interface DataTableProps<TData, TValue> {
  className?: string;
  columns: ColumnDef<TData, TValue>[];
  data: TData[];
}

export function DataTable<TData, TValue>({
  className,
  columns,
  data,
}: DataTableProps<TData, TValue>) {
  "use no memo";

  const [rowSelection, setRowSelection] = useAtom(tableRowSelectionAtom);

  const table = useReactTable({
    columns,
    data,
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
