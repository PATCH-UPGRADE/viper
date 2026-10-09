"use client";

import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { type ReactNode, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { SEE_LIST_PAGE_SIZE } from "../contract";
import { formatCount } from "../review/labels";

export interface SeeListColumn<T> {
  header: string;
  cell: (item: T) => ReactNode;
  className?: string;
}

const EDGE_PADDING = "first:pl-5 last:pr-5";

export const TwoLineCell = ({
  title,
  detail,
}: {
  title: string;
  detail?: string | null;
}) => (
  <div className="flex flex-col gap-0.5">
    <span className="font-medium">{title}</span>
    {detail && <span className="text-xs text-muted-foreground">{detail}</span>}
  </div>
);

export const IdentifierCell = ({ value }: { value: string | null }) =>
  value ? (
    <span className="font-mono text-[13px]">{value}</span>
  ) : (
    <span className="text-muted-foreground">—</span>
  );

export const SeeListDialog = <T,>({
  open,
  onOpenChange,
  title,
  description,
  items,
  columns,
  keyOf,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  items: T[];
  columns: SeeListColumn<T>[];
  keyOf: (item: T) => string;
}) => {
  const [requestedPage, setRequestedPage] = useState(1);
  const pageCount = Math.max(1, Math.ceil(items.length / SEE_LIST_PAGE_SIZE));
  const page = Math.min(requestedPage, pageCount);
  const firstIndex = (page - 1) * SEE_LIST_PAGE_SIZE;
  const itemsOnPage = items.slice(firstIndex, firstIndex + SEE_LIST_PAGE_SIZE);
  const rangeText = `${formatCount(firstIndex + 1)}–${formatCount(firstIndex + itemsOnPage.length)} of ${formatCount(items.length)}`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[80vh] flex-col gap-0 p-0 sm:max-w-3xl">
        <DialogHeader className="border-b px-5 py-4">
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-y-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/60 hover:bg-muted/60">
                {columns.map((column) => (
                  <TableHead
                    key={column.header}
                    className={cn(
                      "h-9 text-xs font-semibold tracking-wide text-muted-foreground uppercase",
                      EDGE_PADDING,
                      column.className,
                    )}
                  >
                    {column.header}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {itemsOnPage.map((item) => (
                <TableRow key={keyOf(item)}>
                  {columns.map((column) => (
                    <TableCell
                      key={column.header}
                      className={cn("py-2.5", EDGE_PADDING, column.className)}
                    >
                      {column.cell(item)}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        <div className="flex min-h-13 items-center justify-between border-t px-5 py-2.5 text-sm">
          <span className="text-muted-foreground">Showing {rangeText}</span>
          {pageCount > 1 && (
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground tabular-nums">
                Page {formatCount(page)} of {formatCount(pageCount)}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={page === 1}
                onClick={() => setRequestedPage(page - 1)}
              >
                <ChevronLeftIcon />
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={page === pageCount}
                onClick={() => setRequestedPage(page + 1)}
              >
                Next
                <ChevronRightIcon />
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
