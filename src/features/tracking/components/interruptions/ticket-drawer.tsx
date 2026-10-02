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
import { RawJsonListCard } from "../ticket-detail/raw-json-list-card";
import { StatusChip } from "../ticket-detail/shared";

export type DrawerTicket = {
  id: string;
  summary: string;
  status: TicketStatus;
  scheduledAt: Date;
  assetName: string;
};

const Field = ({ label, children }: { label: string; children: ReactNode }) => (
  <div className="flex flex-col gap-1">
    <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
      {label}
    </h3>
    <div className="text-sm">{children}</div>
  </div>
);

// Only fetched while the drawer is open: the sheet's content mounts on open.
const Details = ({ id }: { id: string }) => {
  const trpc = useTRPC();
  const { data } = useQuery(
    trpc.tracking.getInterruptionDetail.queryOptions({ id }),
  );
  if (!data) return <p className="text-sm text-muted-foreground">Loading...</p>;
  return (
    <>
      <Field label="Contact">{data.contactName}</Field>
      <Field label="Why this work is needed">
        <p className="whitespace-pre-wrap">
          {data.whyNecessary ?? "Not provided"}
        </p>
      </Field>
      <Field label="Remediation">
        <RawJsonListCard
          items={data.remediations}
          emptyMessage="No remediation is linked to this ticket."
        />
      </Field>
      <ActivityTimeline
        entries={data.comments.map(commentEntry)}
        composer={<AddCommentForm ticketId={id} />}
      />
    </>
  );
};

// The card already holds the schedule, so the one query fetches only the rest.
// Being the sheet's own trigger, the card gets keyboard focus back on close.
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
        <Details id={ticket.id} />
      </div>
    </SheetContent>
  </Sheet>
);
