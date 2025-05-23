import { type ColumnDef, flexRender, getCoreRowModel, useReactTable } from "@tanstack/react-table"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { cn } from "@/lib/utils"
import { useAtom } from "jotai"
import { tableRowSelectionAtom } from "@/state/app-atoms"

interface DataTableProps<TData, TValue> {
	className?: string
	columns: ColumnDef<TData, TValue>[]
	data: TData[]
}

export function DataTable<TData, TValue>({ className, columns, data }: DataTableProps<TData, TValue>) {
	"use no memo"

	const [rowSelection, setRowSelection] = useAtom(tableRowSelectionAtom)

	const table = useReactTable({
		columns,
		data,
		getCoreRowModel: getCoreRowModel(),
		onRowSelectionChange: setRowSelection,
		state: {
			rowSelection
		}
	})

	return (
		<div className={cn("rounded-md border border-sidebar-ring shadow-md grad-background", className)}>
			<Table>
				<TableHeader className="bg-primary ">
					{table.getHeaderGroups().map(headerGroup => (
						<TableRow key={headerGroup.id} className="h-10 hover:bg-primary">
							{headerGroup.headers.map(header => {
								return (
									<TableHead key={header.id} className="text-white ">
										{header.isPlaceholder
											? null
											: flexRender(header.column.columnDef.header, header.getContext())}
									</TableHead>
								)
							})}
						</TableRow>
					))}
				</TableHeader>
				<TableBody className="overflow-y-auto min-h-[18rem] max-h-[18rem] ">
					{table.getRowModel().rows?.length ? (
						table.getRowModel().rows.map(row => (
							<TableRow
								className="bg-background"
								key={row.id}
								data-state={row.getIsSelected() && "selected"}>
								{row.getVisibleCells().map(cell => (
									<TableCell key={cell.id}>
										{flexRender(cell.column.columnDef.cell, cell.getContext())}
									</TableCell>
								))}
							</TableRow>
						))
					) : (
						<>
						{/* <TableRow> */}
							{/* <TableCell colSpan={columns.length} className="h-24 text-center"> */}
								{/* No data available */}
							{/* </TableCell> */}
						{/* </TableRow> */}
						</>
					)}
				</TableBody>
			</Table>
		</div>
	)
}
