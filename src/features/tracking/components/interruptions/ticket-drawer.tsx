"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { type ReactNode, useEffect } from "react";
import { ActivityTimeline } from "@/components/activity-timeline";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
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
import { useMarkTicketSeen } from "../../hooks/use-tracking";
import { commentEntry } from "../ticket-detail/activity-timeline";
import { AddCommentForm } from "../ticket-detail/add-comment-form";
import { MetaField } from "../ticket-detail/overview-card";
import { RawJsonListCard } from "../ticket-detail/raw-json-list-card";
import { CategoryChip, StatusChip } from "../ticket-detail/shared";

export type DrawerTicket = {
  id: string;
  summary: string;
  status: TicketStatus;
  scheduledAt: Date;
  assetName: string;
};

// Only fetched while the drawer is open: the sheet's content mounts on open.
const Details = ({ id }: { id: string }) => {
  const trpc = useTRPC();
  const { data } = useQuery(
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

  if (!data) return <p className="text-sm text-muted-foreground">Loading...</p>;
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span
          className="flex items-center gap-2 text-sm text-muted-foreground"
          title={data.seenBy.map((r) => r.user.name).join(", ")}
        >
          <span className="flex -space-x-1.5">
            {data.seenBy.slice(0, 3).map(({ user }) => (
              <Avatar
                key={user.id}
                className="size-6 border-2 border-background"
              >
                <AvatarFallback className="text-[10px]">
                  {user.name.slice(0, 1).toUpperCase()}
                </AvatarFallback>
              </Avatar>
            ))}
          </span>
          {data.seenBy.length} read
        </span>
        {data.workOrderId && (
          <Link
            href={`/tracking/${data.workOrderId}`}
            className="text-sm underline"
          >
            View work order
          </Link>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <CategoryChip category={data.category} />
        {data.departments.map((d) => (
          <Badge key={d.id} variant="secondary">
            {d.name}
          </Badge>
        ))}
      </div>
      <MetaField label="Why this work is needed">
        <p className="whitespace-pre-wrap">{data.why ?? "Not provided"}</p>
      </MetaField>
      {data.otherDevices.length > 0 && (
        <MetaField label="Assets on this work order">
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
        </MetaField>
      )}
      <MetaField label="Remediation">
        <RawJsonListCard
          items={data.remediations}
          emptyMessage="No remediation is linked to this ticket."
        />
      </MetaField>
      <MetaField label="Questions about this update">
        <p className="font-medium">{data.contact.name}</p>
        <a href={`mailto:${data.contact.email}`} className="underline">
          {data.contact.email}
        </a>
      </MetaField>
      <ActivityTimeline
        entries={data.comments.map(commentEntry)}
        composer={<AddCommentForm ticketId={id} />}
      />
    </>
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
        <Details id={ticket.id} />
      </div>
    </SheetContent>
  </Sheet>
);
