"use client";

import { CheckIcon, MessageSquareIcon } from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getChipClass } from "@/features/tag-colors/palette";
import { TicketStatus } from "@/generated/prisma";
import {
  useMarkWorkOrderComplete,
  useSuspenseAssetWorkOrders,
} from "../hooks/use-tracking";
import type { AssetWorkOrder } from "../types";
import {
  CategoryChip,
  formatScheduledCompact,
  statusHue,
  statusLabels,
} from "./ticket-detail/shared";

const WorkOrderRow = ({
  ticket,
  assetId,
}: {
  ticket: AssetWorkOrder;
  assetId: string;
}) => {
  const markComplete = useMarkWorkOrderComplete(assetId);

  return (
    <TableRow className="hover:bg-muted/40">
      <TableCell className="max-w-96">
        <div className="flex flex-col gap-1">
          <Link href={`/tracking/${ticket.id}`} className="hover:underline">
            <span className="font-medium">{ticket.summary}</span>
          </Link>
          <div className="flex flex-wrap items-center gap-1">
            <CategoryChip category={ticket.category} />
          </div>
        </div>
      </TableCell>
      <TableCell>
        <Badge
          variant="outline"
          className={getChipClass(statusHue[ticket.status])}
        >
          {statusLabels[ticket.status]}
        </Badge>
      </TableCell>
      <TableCell>
        <Button
          variant="outline"
          size="sm"
          disabled={markComplete.isPending}
          onClick={() =>
            markComplete.mutate({ id: ticket.id, status: TicketStatus.DONE })
          }
        >
          <CheckIcon className="size-3.5" />
          Mark as complete
        </Button>
      </TableCell>
      <TableCell>
        {ticket.departments.length === 0 ? (
          <span className="text-muted-foreground">—</span>
        ) : (
          <div className="flex flex-wrap gap-1">
            {ticket.departments.map((d) => (
              <Badge
                key={d.id}
                variant="outline"
                className={getChipClass(d.color)}
              >
                {d.name}
              </Badge>
            ))}
          </div>
        )}
      </TableCell>
      <TableCell className="text-sm">
        {formatScheduledCompact(ticket.scheduledAt)}
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-1 text-muted-foreground">
          <MessageSquareIcon className="size-3.5" />
          <span>{ticket.commentCount}</span>
        </div>
      </TableCell>
    </TableRow>
  );
};

interface AssetWorkOrdersProps {
  assetId: string;
}

export const AssetWorkOrders = ({ assetId }: AssetWorkOrdersProps) => {
  const { data: tickets } = useSuspenseAssetWorkOrders(assetId);

  if (tickets.length === 0) {
    return (
      <p className="flex justify-center pt-24 text-muted-foreground">
        No open work orders for this asset
      </p>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Summary</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>
            <span className="sr-only">Actions</span>
          </TableHead>
          <TableHead>Dept</TableHead>
          <TableHead>Scheduled</TableHead>
          <TableHead>
            <MessageSquareIcon className="size-3.5" aria-hidden="true" />
            <span className="sr-only">Comments</span>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {tickets.map((ticket) => (
          <WorkOrderRow key={ticket.id} ticket={ticket} assetId={assetId} />
        ))}
      </TableBody>
    </Table>
  );
};
