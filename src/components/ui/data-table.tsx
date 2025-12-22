"use client";

import {
  type Column,
  type ColumnDef,
  flexRender,
  getCoreRowModel,
  type RowData,
  type SortingState,
  type Table as TableType,
  useReactTable,
  type VisibilityState,
} from "@tanstack/react-table";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
} from "lucide-react";
import * as React from "react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { type PaginatedResponse, usePaginationParams } from "@/lib/pagination";

declare module "@tanstack/react-table" {
  interface ColumnMeta<_TData extends RowData, _TValue> {
    title: string;
  }
}

interface SortableHeaderProps<TData> {
  header: string;
  column: Column<TData>;
}

export function SortableHeader<TData>({
  header,
  column,
}: SortableHeaderProps<TData>) {
  const iconClassName = "ml-2 h-4 w-4";
  const sorted = column.getIsSorted();

  return (
    <Button
      variant="link"
      className="text-muted-foreground px-0!"
      onClick={() => column.toggleSorting(undefined, true)}
    >
      {header}
      {sorted ? (
        sorted === "asc" ? (
          <ArrowUp strokeWidth={3} className={iconClassName} />
        ) : (
          <ArrowDown strokeWidth={3} className={iconClassName} />
        )
      ) : (
        <ArrowUpDown className={iconClassName} />
      )}
    </Button>
  );
}

interface DataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[];
  paginatedData: PaginatedResponse<TData>;
  search?: React.ReactNode;
}

export function DataTable<TData, TValue>({
  columns,
  paginatedData,
  search,
}: DataTableProps<TData, TValue>) {
  const [sorting, setSorting] = React.useState<SortingState>([]);
  const [_params, setParams] = usePaginationParams();

  const [columnVisibility, setColumnVisibility] =
    React.useState<VisibilityState>({});

  const pagination = {
    pageIndex: paginatedData.page - 1,
    pageSize: paginatedData.pageSize,
  };

  React.useEffect(() => {
    const sortParam = sorting
      .map((s) => `${s.desc ? "-" : ""}${s.id}`)
      .join(",");
    setParams((prev) => ({ ...prev, sort: sortParam }));
  }, [sorting, setParams]);

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
      <div className="flex items-center py-4">
        {search}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" className="ml-auto">
              Columns <ChevronDown />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {table
              .getAllColumns()
              .filter((column) => column.getCanHide())
              .map((column) => {
                return (
                  <DropdownMenuCheckboxItem
                    key={column.id}
                    className="capitalize"
                    checked={column.getIsVisible()}
                    onCheckedChange={(value) =>
                      column.toggleVisibility(!!value)
                    }
                  >
                    {column.columnDef.meta?.title || column.id}
                  </DropdownMenuCheckboxItem>
                );
              })}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <div className="overflow-hidden rounded-md border">
        <Table className="bg-background">
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => {
                  return (
                    <TableHead
                      key={header.id}
                      className="py-4 first-of-type:pl-4 last-of-type:pr-4 text-muted-foreground"
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
          <TableBody>
            {table.getRowModel().rows?.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  data-state={row.getIsSelected() && "selected"}
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
                  No results.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      <div className="mt-2">
        <DataTablePagination table={table} />
      </div>
    </>
  );
}

interface DataTablePaginationProps<TData> {
  table: TableType<TData>;
}

export function DataTablePagination<TData>({
  table,
}: DataTablePaginationProps<TData>) {
  const [params, setParams] = usePaginationParams();

  return (
    <div className="flex items-center justify-end px-2">
      <div className="flex items-center space-x-6 lg:space-x-8">
        <div className="flex items-center space-x-2">
          <p className="text-sm font-medium">Rows per page</p>
          <Select
            value={`${table.getState().pagination.pageSize}`}
            onValueChange={(value) => {
              setParams({ ...params, ...{ pageSize: Number(value), page: 1 } });
            }}
          >
            <SelectTrigger className="h-8 w-[70px] bg-background">
              <SelectValue placeholder={table.getState().pagination.pageSize} />
            </SelectTrigger>
            <SelectContent side="top">
              {[10, 20, 30, 40, 50].map((pageSize) => (
                <SelectItem key={pageSize} value={`${pageSize}`}>
                  {pageSize}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex w-[100px] items-center justify-center text-sm font-medium">
          Page {table.getState().pagination.pageIndex + 1} of{" "}
          {table.getPageCount()}
        </div>
        <div className="flex items-center space-x-2">
          <Button
            variant="outline"
            size="icon"
            className="hidden size-8 lg:flex"
            onClick={() => setParams({ ...params, ...{ page: 1 } })}
            disabled={!table.getCanPreviousPage()}
          >
            <span className="sr-only">Go to first page</span>
            <ChevronsLeft />
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="size-8"
            onClick={() =>
              setParams({ ...params, ...{ page: params.page - 1 } })
            }
            disabled={!table.getCanPreviousPage()}
          >
            <span className="sr-only">Go to previous page</span>
            <ChevronLeft />
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="size-8"
            onClick={() =>
              setParams({ ...params, ...{ page: params.page + 1 } })
            }
            disabled={!table.getCanNextPage()}
          >
            <span className="sr-only">Go to next page</span>
            <ChevronRight />
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="hidden size-8 lg:flex"
            onClick={() =>
              setParams({ ...params, ...{ page: table.getPageCount() } })
            }
            disabled={!table.getCanNextPage()}
          >
            <span className="sr-only">Go to last page</span>
            <ChevronsRight />
          </Button>
        </div>
      </div>
    </div>
  );
}
