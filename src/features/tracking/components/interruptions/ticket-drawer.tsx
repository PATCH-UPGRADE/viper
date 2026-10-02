"use client";

import { useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { ActivityTimeline } from "@/components/activity-timeline";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import type { TicketStatus } from "@/generated/prisma";
import { formatScheduled } from "@/lib/date-utils";
import { useTRPC } from "@/trpc/client";
import { commentEntry } from "../ticket-detail/activity-timeline";
import { AddCommentForm } from "../ticket-detail/add-comment-form";
import { StatusChip } from "../ticket-detail/shared";

export type DrawerTicket = {
  id: string;
  summary: string;
  status: TicketStatus;
  scheduledAt: Date;
  assetName: string;
};

// Only fetched while the drawer is open: the sheet's content mounts on open.
const Comments = ({ id }: { id: string }) => {
  const trpc = useTRPC();
  const { data } = useQuery(
    trpc.tracking.getInterruptionComments.queryOptions({ id }),
  );
  return (
    <ActivityTimeline
      entries={(data ?? []).map(commentEntry)}
      composer={<AddCommentForm ticketId={id} />}
    />
  );
};

// The card already holds everything but the comments. As the sheet's own
// trigger, the card gets keyboard focus back when the drawer closes.
export const TicketDrawer = ({
  ticket,
  children,
}: {
  ticket: DrawerTicket;
  children: ReactNode;
}) => (
  <Sheet>
    <SheetTrigger asChild>{children}</SheetTrigger>
    <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
      <SheetHeader>
        <SheetTitle>{ticket.summary}</SheetTitle>
        <SheetDescription className="sr-only">
          Details and comments for this maintenance ticket.
        </SheetDescription>
      </SheetHeader>
      <div className="flex flex-col gap-4 px-4 pb-6">
        <p className="font-medium">{ticket.assetName}</p>
        <StatusChip status={ticket.status} className="w-fit" />
        <p className="text-sm">
          Scheduled: {formatScheduled(ticket.scheduledAt)}
        </p>
        <Comments id={ticket.id} />
      </div>
    </SheetContent>
  </Sheet>
);
