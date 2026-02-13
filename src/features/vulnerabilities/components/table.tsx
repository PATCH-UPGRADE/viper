import {
  type Column,
  type ColumnDef,
  flexRender,
  getCoreRowModel,
  type Row,
  type RowData,
  type SortingState,
  type Table as TableType,
  useReactTable,
  type VisibilityState,
} from "@tanstack/react-table";
import * as React from "react";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import { type PaginatedResponse, usePaginationParams } from "@/lib/pagination";
import { cn } from "@/lib/utils";

interface DataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[];
  paginatedData: PaginatedResponse<TData>;
  isLoading?: boolean;
  search?: React.ReactNode;
  rowOnclick?: (row: Row<TData>) => void;
}

export function CollapsibleDataTable<TData, TValue>({
  columns,
  paginatedData,
  isLoading,
  search,
  rowOnclick,
}: DataTableProps<TData, TValue>) {
  const [sorting, setSorting] = React.useState<SortingState>([]);
  const [isPending, _startTransition] = React.useTransition();

  const [columnVisibility, setColumnVisibility] =
    React.useState<VisibilityState>({});

  const pagination = {
    pageIndex: paginatedData.page - 1,
    pageSize: paginatedData.pageSize,
  };

  const table = useReactTable({
    data: paginatedData.items,
    columns,
    getCoreRowModel: getCoreRowModel(),
    manualSorting: true,
    onSortingChange: setSorting,
    onColumnVisibilityChange: setColumnVisibility,
    state: {
      sorting,
      columnVisibility,
      pagination,
    },
    //getPaginationRowModel: getPaginationRowModel(),
    manualPagination: true,
    rowCount: paginatedData.totalCount,
  });

  return (
    <>
      <div className="overflow-hidden rounded-md border">
        <Table className="bg-background">
          <TableHeader className="bg-muted">
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => {
                  return (
                    <TableHead
                      key={header.id}
                      className="py-2 first-of-type:pl-4 last-of-type:pr-4 text-muted-foreground"
                    >
                      {header.isPlaceholder
                        ? null
                        : flexRender(
                            header.column.columnDef.header,
                            header.getContext(),
                          )}
                    </TableHead>
                  );
                })}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody className={isPending ? "opacity-50" : ""}>
            {!isLoading && table.getRowModel().rows?.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  data-state={row.getIsSelected() && "selected"}
                  onClick={rowOnclick ? () => rowOnclick(row) : undefined}
                  className={cn(rowOnclick ? "cursor-pointer" : "")}
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell
                      key={cell.id}
                      className="py-4 first-of-type:pl-4 last-of-type:pr-4"
                    >
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext(),
                      )}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell
                  colSpan={columns.length}
                  className="h-24 text-center"
                >
                  {isLoading ? (
                    <i className="italic">Loading...</i>
                  ) : (
                    "No results."
                  )}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </>
  );
}
