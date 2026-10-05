"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { type ReactNode, useEffect } from "react";
import { ActivityTimeline } from "@/components/activity-timeline";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { UserAvatar } from "@/components/user-avatar";
import type { MaintenanceAvailability, TicketStatus } from "@/generated/prisma";
import { formatScheduled } from "@/lib/date-utils";
import { cn } from "@/lib/utils";
import { useTRPC } from "@/trpc/client";
import { useMarkTicketSeen } from "../../hooks/use-tracking";
import { commentEntry } from "../ticket-detail/activity-timeline";
import { AddCommentForm } from "../ticket-detail/add-comment-form";
import {
  availabilityStyle,
  CategoryChip,
  StatusChip,
} from "../ticket-detail/shared";

export type DrawerTicket = {
  id: string;
  summary: string;
  status: TicketStatus;
  scheduledAt: Date | null;
  assetName: string;
  durationEstimate: number | null;
  availability: MaintenanceAvailability | null;
};

// Only fetched while the drawer is open: the sheet's content mounts on open.
const Details = ({ ticket }: { ticket: DrawerTicket }) => {
  const { id, availability } = ticket;
  const trpc = useTRPC();
  const { data, isError } = useQuery(
    trpc.tracking.getInterruptionDetail.queryOptions({ id }),
  );
  const markSeen = useMarkTicketSeen();

  // Opening a ticket counts as reading it, once the server has confirmed the
  // user may see it.
  const loaded = Boolean(data);
  // biome-ignore lint/correctness/useExhaustiveDependencies: `mutate` is stable
  useEffect(() => {
    if (loaded) markSeen.mutate({ ticketId: id });
  }, [loaded, id]);

  if (isError) {
    return (
      <p className="text-sm text-destructive">Could not load this ticket.</p>
    );
  }
  if (!data) return <p className="text-sm text-muted-foreground">Loading...</p>;
  const banner = availabilityStyle(availability);
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <Link href={`/tracking/${data.workOrderId}`} className="underline">
          View work order
        </Link>
        <span className="text-muted-foreground">{data.seenBy.length} read</span>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <StatusChip status={ticket.status} />
        <CategoryChip category={data.category} />
      </div>
      <div
        className={cn(
          "flex items-center gap-2 rounded-lg border p-3 text-sm",
          banner.className,
        )}
      >
        <banner.Icon className="size-5 shrink-0" aria-hidden />
        <div>
          <p className="font-semibold">{banner.label}</p>
          <p className="text-xs">As recorded on the work order</p>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 rounded-lg border p-3 text-sm">
        {[
          [
            "Scheduled",
            formatScheduled(ticket.scheduledAt) ?? "No time recorded",
          ],
          [
            "Estimated duration",
            ticket.durationEstimate
              ? `${ticket.durationEstimate} min`
              : "Unknown",
          ],
        ].map(([label, value]) => (
          <div key={label}>
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="font-medium">{value}</p>
          </div>
        ))}
      </div>
      <Section title="Why this work is needed">
        <p className="whitespace-pre-wrap text-muted-foreground">
          {data.why ?? "Not provided"}
        </p>
      </Section>
      {data.otherDevices.length > 0 && (
        <Section title="Assets on this work order">
          <ul className="divide-y rounded-lg border">
            {data.otherDevices.map((device) => (
              <li
                key={device.id}
                className="flex flex-wrap items-center justify-between gap-2 px-3 py-2"
              >
                <span className="font-medium">{device.name}</span>
                <span className="flex items-center gap-2 text-muted-foreground">
                  {device.scheduledAt
                    ? formatScheduled(device.scheduledAt)
                    : "Not scheduled"}
                  <StatusChip status={device.status} />
                </span>
              </li>
            ))}
          </ul>
        </Section>
      )}
      <Section title="Questions about this update">
        <div className="flex items-center gap-3 rounded-lg border p-3">
          <UserAvatar user={data.contact} />
          <div className="flex flex-col">
            <span className="font-medium">{data.contact.name}</span>
            <a
              href={`mailto:${data.contact.email}`}
              className="text-muted-foreground underline"
            >
              {data.contact.email}
            </a>
          </div>
        </div>
      </Section>
      <ActivityTimeline
        entries={data.comments.map(commentEntry)}
        composer={<AddCommentForm ticketId={id} />}
      />
    </>
  );
};

const Section = ({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) => (
  <section className="flex flex-col gap-1.5 text-sm">
    <h3 className="font-semibold">{title}</h3>
    {children}
  </section>
);

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
        <Details ticket={ticket} />
      </div>
    </SheetContent>
  </Sheet>
);
