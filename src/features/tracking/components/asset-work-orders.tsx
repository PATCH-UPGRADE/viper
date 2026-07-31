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
import { CategoryColorProvider } from "@/features/tag-colors/context";
import { getChipClass } from "@/features/tag-colors/palette";
import { TicketStatus } from "@/generated/prisma";
import {
  useSuspenseAssetWorkOrders,
  useUpdateTicket,
} from "../hooks/use-tracking";
import {
  CategoryChip,
  formatScheduled,
  statusHue,
  statusLabels,
} from "./ticket-detail/shared";

const MarkCompleteButton = ({ ticketId }: { ticketId: string }) => {
  const update = useUpdateTicket(ticketId);

  return (
    <Button
      variant="outline"
      size="sm"
      disabled={update.isPending}
      onClick={() => update.mutate({ id: ticketId, status: TicketStatus.DONE })}
    >
      <CheckIcon className="size-3.5" />
      Mark as complete
    </Button>
  );
};

export const AssetWorkOrders = ({ assetId }: { assetId: string }) => {
  const { data: tickets } = useSuspenseAssetWorkOrders(assetId);

  if (tickets.length === 0) {
    return (
      <p className="flex justify-center pt-24 text-muted-foreground">
        No open work orders for this asset
      </p>
    );
  }

  return (
    <CategoryColorProvider>
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
            <TableRow key={ticket.id} className="hover:bg-muted/40">
              <TableCell className="max-w-96">
                <div className="flex flex-col gap-1">
                  <Link
                    href={`/tracking/${ticket.id}`}
                    className="font-medium hover:underline"
                  >
                    {ticket.summary}
                  </Link>
                  <CategoryChip category={ticket.category} />
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
                <MarkCompleteButton ticketId={ticket.id} />
              </TableCell>
              <TableCell>
                {ticket.departments.length === 0 ? (
                  <span className="text-muted-foreground">—</span>
                ) : (
                  <div className="flex flex-wrap gap-1">
                    {ticket.departments.map((department) => (
                      <Badge
                        key={department.id}
                        variant="outline"
                        className={getChipClass(department.color)}
                      >
                        {department.name}
                      </Badge>
                    ))}
                  </div>
                )}
              </TableCell>
              <TableCell className="text-sm">
                {formatScheduled(ticket.scheduledAt) ?? "—"}
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-1 text-muted-foreground">
                  <MessageSquareIcon className="size-3.5" />
                  <span>{ticket.commentCount}</span>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </CategoryColorProvider>
  );
};
