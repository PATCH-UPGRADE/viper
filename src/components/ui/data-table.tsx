"use client";

import {
  type Column,
  type ColumnDef,
  type ExpandedState,
  flexRender,
  getCoreRowModel,
  getExpandedRowModel,
  type Row,
  type RowData,
  type SortingState,
  type Table as TableType,
  useReactTable,
  type VisibilityState,
} from "@tanstack/react-table";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  ChevronsUpDown,
  ChevronUp,
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
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { type PaginatedResponse, usePaginationParams } from "@/lib/pagination";
import { cn } from "@/lib/utils";

declare module "@tanstack/react-table" {
  // biome-ignore lint/correctness/noUnusedVariables: required for declaration merging
  interface ColumnMeta<TData extends RowData, TValue> {
    title: string;
    headerClassName?: string;
    cellClassName?: string;
    colSpan?: (row: Row<TData>) => number;
  }
}

// ---------------------------------------------------------------------------
// SortableHeader
// ---------------------------------------------------------------------------

interface SortableHeaderProps<TData> {
  header: string;
  column: Column<TData>;
  tooltip?: string;
}

export function SortableHeader<TData>({
  header,
  column,
  tooltip,
}: SortableHeaderProps<TData>) {
  const iconClassName = "ml-2 h-4 w-4";
  const sorted = column.getIsSorted();
  const isAscending = sorted === "asc";

  const button = (
    <Button
      variant="link"
      className="text-muted-foreground px-0!"
      onClick={() => column.toggleSorting(undefined, true)}
      aria-label={`Sort by ${tooltip ?? header}${sorted ? (isAscending ? ", ascending" : ", descending") : ""}`}
    >
      {header}
      {sorted ? (
        isAscending ? (
          <ChevronUp
            strokeWidth={3}
            className={iconClassName}
            aria-hidden="true"
          />
        ) : (
          <ChevronDown
            strokeWidth={3}
            className={iconClassName}
            aria-hidden="true"
          />
        )
      ) : (
        <ChevronsUpDown className={iconClassName} aria-hidden="true" />
      )}
    </Button>
  );

  if (!tooltip) return button;

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>{button}</TooltipTrigger>
        <TooltipContent>{tooltip}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

// ---------------------------------------------------------------------------
// NestedTable
// ---------------------------------------------------------------------------

interface NestedTableProps<TNestedData, TNestedValue> {
  columns: ColumnDef<TNestedData, TNestedValue>[];
  data: TNestedData[];
}

function NestedTable<TNestedData, TNestedValue>({
  columns,
  data,
}: NestedTableProps<TNestedData, TNestedValue>) {
  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  return (
    <Table aria-label="Nested details">
      <TableHeader>
        {table.getHeaderGroups().map((headerGroup) => (
          <TableRow key={headerGroup.id}>
            {headerGroup.headers.map((header) => (
              <TableHead key={header.id}>
                {header.isPlaceholder
                  ? null
                  : flexRender(
                      header.column.columnDef.header,
                      header.getContext(),
                    )}
              </TableHead>
            ))}
          </TableRow>
        ))}
      </TableHeader>
      <TableBody>
        {table.getRowModel().rows.length ? (
          table.getRowModel().rows.map((row) => (
            <TableRow key={row.id}>
              {row.getVisibleCells().map((cell) => (
                <TableCell key={cell.id}>
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </TableCell>
              ))}
            </TableRow>
          ))
        ) : (
          <TableRow>
            <TableCell
              colSpan={columns.length}
              className="text-center text-muted-foreground"
            >
              No data found
            </TableCell>
          </TableRow>
        )}
      </TableBody>
    </Table>
  );
}

// ---------------------------------------------------------------------------
// DataTable
// ---------------------------------------------------------------------------

interface DataTableProps<
  TData,
  TValue,
  TNestedData = unknown,
  TNestedValue = unknown,
> {
  columns: ColumnDef<TData, TValue>[];
  paginatedData: PaginatedResponse<TData>;
  isLoading?: boolean;
  search?: React.ReactNode;
  rowOnclick?: (row: Row<TData>) => void;
  /** When provided, rows become collapsible and render a nested table. */
  nestedColumns?: ColumnDef<TNestedData, TNestedValue>[];
  /** Key on each row's data that holds the nested array. */
  nestedDataKey?: keyof TData;
  /**
   * When true, child rows render inline in the main table (sharing column
   * widths) instead of as a separate nested mini-table. Requires nestedDataKey
   * and that child rows are structurally compatible with the parent columns.
   */
  inlineNestedRows?: boolean;
}

export function DataTable<
  TData,
  TValue,
  TNestedData = unknown,
  TNestedValue = unknown,
>({
  columns,
  paginatedData,
  isLoading,
  search,
  rowOnclick,
  nestedColumns,
  nestedDataKey,
  inlineNestedRows,
}: DataTableProps<TData, TValue, TNestedData, TNestedValue>) {
  const [sorting, setSorting] = React.useState<SortingState>([]);
  const [_params, setParams] = usePaginationParams();
  const [isPending, startTransition] = React.useTransition();
  const [expandedRows, setExpandedRows] = React.useState<Set<string>>(
    new Set(),
  );
  const [expandedTanstack, setExpandedTanstack] =
    React.useState<ExpandedState>({});

  // Reset expanded rows when the page data changes
  // biome-ignore lint/correctness/useExhaustiveDependencies: do use paginated data as dependency here to trigger on page change
  React.useEffect(() => {
    setExpandedRows(new Set());
    setExpandedTanstack({});
  }, [paginatedData.page]);

  const [columnVisibility, setColumnVisibility] =
    React.useState<VisibilityState>({});

  const pagination = {
    pageIndex: paginatedData.page - 1,
    pageSize: paginatedData.pageSize,
  };

  const prevSortingRef = React.useRef<string>("");

  React.useEffect(() => {
    const sortParam = sorting
      .map((s) => `${s.desc ? "-" : ""}${s.id}`)
      .join(",");
    if (sortParam !== prevSortingRef.current) {
      prevSortingRef.current = sortParam;
      startTransition(() => {
        setParams((prev) => ({ ...prev, sort: sortParam }));
      });
    }
  }, [sorting, setParams]);

  const hasNestedTable = nestedColumns && nestedDataKey;
  const isInlineNested = !!(inlineNestedRows && nestedDataKey);

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
      ...(isInlineNested ? { expanded: expandedTanstack } : {}),
    },
    manualPagination: true,
    rowCount: paginatedData.totalCount,
    ...(isInlineNested && nestedDataKey
      ? {
          getSubRows: (row: TData) =>
            (row[nestedDataKey] as unknown as TData[]) ?? undefined,
          getExpandedRowModel: getExpandedRowModel(),
          onExpandedChange: setExpandedTanstack,
        }
      : {}),
  });

  const toggleRow = (rowId: string) => {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      next.has(rowId) ? next.delete(rowId) : next.add(rowId);
      return next;
    });
  };

  return (
    <>
      <div className="flex items-center py-4 gap-2">
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
              .map((column) => (
                <DropdownMenuCheckboxItem
                  key={column.id}
                  className="capitalize"
                  checked={column.getIsVisible()}
                  onCheckedChange={(value) => column.toggleVisibility(!!value)}
                >
                  {column.columnDef.meta?.title || column.id}
                </DropdownMenuCheckboxItem>
              ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="overflow-hidden rounded-md border">
        <Table className="bg-background">
          <TableHeader className="bg-muted">
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {(hasNestedTable || isInlineNested) && (
                  <TableHead className="w-12 py-2 pl-4" />
                )}
                {headerGroup.headers.map((header) => (
                  <TableHead
                    key={header.id}
                    className={cn(
                      "py-2 first-of-type:pl-4 last-of-type:pr-4 text-muted-foreground",
                      header.column.columnDef.meta?.headerClassName,
                    )}
                  >
                    {header.isPlaceholder
                      ? null
                      : flexRender(
                          header.column.columnDef.header,
                          header.getContext(),
                        )}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>

          <TableBody className={isPending ? "opacity-50" : ""}>
            {!isLoading && table.getRowModel().rows?.length ? (
              table.getRowModel().rows.map((row) => {
                const nestedData =
                  hasNestedTable && !isInlineNested
                    ? (row.original[nestedDataKey] as TNestedData[])
                    : [];
                const hasNestedData =
                  Array.isArray(nestedData) && nestedData.length > 0;
                const legacyExpanded =
                  hasNestedTable && !isInlineNested && expandedRows.has(row.id);

                const inlineCanExpand = isInlineNested && row.getCanExpand();
                const inlineIsExpanded = isInlineNested && row.getIsExpanded();
                const showChevron = hasNestedTable || isInlineNested;
                const chevronVisible = isInlineNested
                  ? inlineCanExpand
                  : true;
                const chevronExpanded = isInlineNested
                  ? inlineIsExpanded
                  : !!legacyExpanded;
                const isChildRow = isInlineNested && row.depth > 0;

                return (
                  <React.Fragment key={row.id}>
                    <TableRow
                      data-state={row.getIsSelected() && "selected"}
                      className={cn(
                        rowOnclick ? "cursor-pointer" : "",
                        isChildRow &&
                          "bg-blue-100/80 hover:bg-blue-100 dark:bg-muted/60 dark:hover:bg-muted/70",
                      )}
                      onClick={rowOnclick ? () => rowOnclick(row) : undefined}
                    >
                      {showChevron && (
                        <TableCell className="py-4 pl-4 w-12">
                          {chevronVisible && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                if (isInlineNested) {
                                  row.toggleExpanded();
                                } else {
                                  toggleRow(row.id);
                                }
                              }}
                              className="h-8 w-8 p-0"
                              disabled={
                                isInlineNested
                                  ? !inlineCanExpand
                                  : !hasNestedData
                              }
                              aria-label={
                                chevronExpanded
                                  ? "Collapse nested data"
                                  : "Expand nested data"
                              }
                              aria-expanded={chevronExpanded}
                            >
                              {chevronExpanded ? (
                                <ChevronDown
                                  className="h-4 w-4"
                                  aria-hidden="true"
                                />
                              ) : (
                                <ChevronRight
                                  className="h-4 w-4"
                                  aria-hidden="true"
                                />
                              )}
                            </Button>
                          )}
                        </TableCell>
                      )}
                      {(() => {
                        const cells = row.getVisibleCells();
                        const rendered: React.ReactNode[] = [];
                        let skip = 0;
                        for (let i = 0; i < cells.length; i++) {
                          if (skip > 0) {
                            skip--;
                            continue;
                          }
                          const cell = cells[i];
                          const colSpan =
                            cell.column.columnDef.meta?.colSpan?.(row) ?? 1;
                          if (colSpan > 1) {
                            skip = colSpan - 1;
                          }
                          rendered.push(
                            <TableCell
                              key={cell.id}
                              colSpan={colSpan > 1 ? colSpan : undefined}
                              className={cn(
                                "py-4 first-of-type:pl-4 last-of-type:pr-4",
                                cell.column.columnDef.meta?.cellClassName,
                              )}
                              style={
                                isChildRow && i === 0
                                  ? { paddingLeft: `${row.depth * 1.5 + 1}rem` }
                                  : undefined
                              }
                            >
                              {flexRender(
                                cell.column.columnDef.cell,
                                cell.getContext(),
                              )}
                            </TableCell>,
                          );
                        }
                        return rendered;
                      })()}
                    </TableRow>

                    {hasNestedTable && !isInlineNested && legacyExpanded && (
                      <TableRow>
                        <TableCell colSpan={columns.length + 1} className="p-0">
                          <div className="overflow-x-auto pl-12 pr-4 py-4 bg-muted/50">
                            <NestedTable<TNestedData, TNestedValue>
                              columns={nestedColumns}
                              data={nestedData ?? []}
                            />
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </React.Fragment>
                );
              })
            ) : (
              <TableRow>
                <TableCell
                  colSpan={
                    columns.length + (hasNestedTable || isInlineNested ? 1 : 0)
                  }
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

      <div className="mt-2">
        <DataTablePagination table={table} />
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// DataTablePagination
// ---------------------------------------------------------------------------

interface DataTablePaginationProps<TData> {
  table: TableType<TData>;
}

export function DataTablePagination<TData>({
  table,
}: DataTablePaginationProps<TData>) {
  const [_params, setParams] = usePaginationParams();

  const handlePageSizeChange = React.useCallback(
    (value: string) =>
      setParams((prev) => ({ ...prev, pageSize: Number(value), page: 1 })),
    [setParams],
  );

  const handleFirstPage = React.useCallback(
    () => setParams((prev) => ({ ...prev, page: 1 })),
    [setParams],
  );

  const handlePreviousPage = React.useCallback(
    () => setParams((prev) => ({ ...prev, page: prev.page - 1 })),
    [setParams],
  );

  const handleNextPage = React.useCallback(
    () => setParams((prev) => ({ ...prev, page: prev.page + 1 })),

    [setParams],
  );

  const handleLastPage = React.useCallback(
    () => setParams((prev) => ({ ...prev, page: table.getPageCount() })),
    [setParams, table],
  );

  return (
    <div className="flex items-center justify-end px-2">
      <div className="flex items-center space-x-6 lg:space-x-8">
        <div className="flex items-center space-x-2">
          <p className="text-sm font-medium">Rows per page</p>
          <Select
            value={`${table.getState().pagination.pageSize}`}
            onValueChange={handlePageSizeChange}
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
            onClick={handleFirstPage}
            disabled={!table.getCanPreviousPage()}
          >
            <span className="sr-only">Go to first page</span>
            <ChevronsLeft />
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="size-8"
            onClick={handlePreviousPage}
            disabled={!table.getCanPreviousPage()}
          >
            <span className="sr-only">Go to previous page</span>
            <ChevronLeft />
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="size-8"
            onClick={handleNextPage}
            disabled={!table.getCanNextPage()}
          >
            <span className="sr-only">Go to next page</span>
            <ChevronRight />
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="hidden size-8 lg:flex"
            onClick={handleLastPage}
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
