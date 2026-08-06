"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { TicketStatus } from "@/generated/prisma";
import { formatScheduled } from "@/lib/date-utils";
import {
  useSuspenseAssetWorkOrders,
  useUpdateTicket,
} from "../hooks/use-tracking";
import {
  categoryLabels,
  DepartmentChips,
  StatusChip,
} from "./ticket-detail/shared";

type Ticket = ReturnType<typeof useSuspenseAssetWorkOrders>["data"][number];

const TWO_DAYS_MS = 2 * 24 * 60 * 60 * 1000;

const findSuggested = (tickets: Ticket[]): Ticket | null => {
  const now = Date.now();
  let suggested: Ticket | null = null;
  let closestDistance = Number.POSITIVE_INFINITY;

  for (const ticket of tickets) {
    if (!ticket.scheduledAt) continue;
    const distance = Math.abs(ticket.scheduledAt.getTime() - now);
    if (distance > TWO_DAYS_MS || distance >= closestDistance) continue;
    suggested = ticket;
    closestDistance = distance;
  }

  return suggested;
};

export const SuggestedWorkOrderModal = ({ assetId }: { assetId: string }) => {
  const { data: tickets } = useSuspenseAssetWorkOrders(assetId);
  const ticket = findSuggested(tickets);
  const update = useUpdateTicket(ticket?.id ?? "");
  const [open, setOpen] = useState(true);

  if (!ticket) return null;

  const complete = () =>
    update.mutate(
      { id: ticket.id, status: TicketStatus.DONE },
      { onSuccess: () => setOpen(false) },
    );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Are you completing this work order?</DialogTitle>
          <DialogDescription>
            This ticket is scheduled within two days of now.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3 rounded-lg border p-4">
          <div className="flex items-start justify-between gap-2">
            <span className="font-medium">{ticket.summary}</span>
            <StatusChip status={ticket.status} />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">{categoryLabels[ticket.category]}</Badge>
            <DepartmentChips departments={ticket.departments} />
          </div>
          {ticket.body && (
            <p className="line-clamp-2 text-sm text-muted-foreground">
              {ticket.body}
            </p>
          )}
          <div className="text-sm text-muted-foreground">
            Scheduled {formatScheduled(ticket.scheduledAt)}
          </div>
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">No</Button>
          </DialogClose>
          <Button onClick={complete} disabled={update.isPending}>
            Yes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
