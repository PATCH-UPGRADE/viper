import {
  type ColumnDef,
  flexRender,
  getCoreRowModel,
  type Row,
  type SortingState,
  useReactTable,
  type VisibilityState,
} from "@tanstack/react-table";
import * as React from "react";
import { ChevronDown, ChevronRight } from "lucide-react";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";

import { type PaginatedResponse } from "@/lib/pagination";
import { cn } from "@/lib/utils";

interface DataTableProps<TData, TValue, TNestedData = any> {
  columns: ColumnDef<TData, TValue>[];
  paginatedData: PaginatedResponse<TData>;
  isLoading?: boolean;
  search?: React.ReactNode;
  rowOnclick?: (row: Row<TData>) => void;
  // Nested table props
  nestedColumns?: ColumnDef<TNestedData, any>[];
  nestedDataKey?: keyof TData;
}

export function CollapsibleDataTable<TData, TValue, TNestedData = any>({
  columns,
  paginatedData,
  isLoading,
  search,
  rowOnclick,
  nestedColumns,
  nestedDataKey,
}: DataTableProps<TData, TValue, TNestedData>) {
  const [sorting, setSorting] = React.useState<SortingState>([]);
  const [isPending, _startTransition] = React.useTransition();
  const [expandedRows, setExpandedRows] = React.useState<Set<string>>(
    new Set(),
  );

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
    manualPagination: true,
    rowCount: paginatedData.totalCount,
  });

  const toggleRow = (rowId: string) => {
    const newExpanded = new Set(expandedRows);
    if (newExpanded.has(rowId)) {
      newExpanded.delete(rowId);
    } else {
      newExpanded.add(rowId);
    }
    setExpandedRows(newExpanded);
  };

  const hasNestedTable = nestedColumns && nestedDataKey;

  return (
    <>
      <div className="overflow-hidden rounded-md border">
        <Table className="bg-background">
          <TableHeader className="bg-muted">
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {hasNestedTable && <TableHead className="w-12 py-2 pl-4" />}
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
              table.getRowModel().rows.map((row) => {
                const nestedData = hasNestedTable
                  ? (row.original[nestedDataKey] as TNestedData[])
                  : [];
                const hasNestedData =
                  Array.isArray(nestedData) && nestedData.length > 0;

                return (
                  <React.Fragment key={row.id}>
                    <TableRow
                      data-state={row.getIsSelected() && "selected"}
                      className={cn(rowOnclick ? "cursor-pointer" : "")}
                    >
                      {hasNestedTable && (
                        <TableCell className="py-4 pl-4">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => toggleRow(row.id)}
                            className="h-8 w-8 p-0"
                            disabled={!hasNestedData}
                          >
                            {expandedRows.has(row.id) ? (
                              <ChevronDown className="h-4 w-4" />
                            ) : (
                              <ChevronRight className="h-4 w-4" />
                            )}
                          </Button>
                        </TableCell>
                      )}
                      {row.getVisibleCells().map((cell) => (
                        <TableCell
                          key={cell.id}
                          className="py-4 first-of-type:pl-4 last-of-type:pr-4"
                          onClick={
                            rowOnclick ? () => rowOnclick(row) : undefined
                          }
                        >
                          {flexRender(
                            cell.column.columnDef.cell,
                            cell.getContext(),
                          )}
                        </TableCell>
                      ))}
                    </TableRow>
                    {hasNestedTable && expandedRows.has(row.id) && (
                      <TableRow>
                        <TableCell colSpan={columns.length + 1} className="p-0">
                          <div className="overflow-x-auto pl-12 pr-4 py-4 bg-muted/50">
                            <Table>
                              <TableHeader>
                                <TableRow>
                                  {nestedColumns.map((column, index) => (
                                    <TableHead key={index}>
                                      {typeof column.header === "function"
                                        ? column.header({
                                            column: {} as any,
                                            header: {} as any,
                                            table: {} as any,
                                          })
                                        : column.header}
                                    </TableHead>
                                  ))}
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {hasNestedData ? (
                                  nestedData.map((item, index) => (
                                    <TableRow key={index}>
                                      {nestedColumns.map((column, colIndex) => (
                                        <TableCell key={colIndex}>
                                          {typeof column.cell === "function"
                                            ? column.cell({
                                                row: { original: item } as any,
                                                getValue: () => item,
                                                renderValue: () => item,
                                                cell: {} as any,
                                                column: {} as any,
                                                table: {} as any,
                                              })
                                            : null}
                                        </TableCell>
                                      ))}
                                    </TableRow>
                                  ))
                                ) : (
                                  <TableRow>
                                    <TableCell
                                      colSpan={nestedColumns.length}
                                      className="text-center text-muted-foreground"
                                    >
                                      No nested data found
                                    </TableCell>
                                  </TableRow>
                                )}
                              </TableBody>
                            </Table>
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
                  colSpan={columns.length + (hasNestedTable ? 1 : 0)}
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
