"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { type ReactNode, useEffect } from "react";
import { ActivityTimelineBody } from "@/components/activity-timeline";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { TicketStatus } from "@/generated/prisma";
import { formatScheduled } from "@/lib/date-utils";
import { useTRPC } from "@/trpc/client";
import { useMarkTicketSeen } from "../../hooks/use-tracking";
import {
  activityEntry,
  commentEntry,
} from "../ticket-detail/activity-timeline";
import { AddCommentForm } from "../ticket-detail/add-comment-form";
import { MetaField } from "../ticket-detail/overview-card";
import { CategoryChip, StatusChip } from "../ticket-detail/shared";

export type DrawerTicket = {
  id: string;
  summary: string;
  status: TicketStatus;
  scheduledAt: Date;
  assetName: string;
};

const Count = ({ n }: { n: number }) => (
  <span className="rounded-full bg-muted px-1.5 text-xs">{n}</span>
);

// Only fetched while the drawer is open: the sheet's content mounts on open.
const Details = ({ id }: { id: string }) => {
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
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span
          className="text-sm text-muted-foreground"
          title={data.seenBy.map((r) => r.user.name).join(", ")}
        >
          {data.seenBy.length} read
        </span>
        <Link
          href={`/tracking/${data.workOrderId}`}
          className="text-sm underline"
        >
          View work order
        </Link>
      </div>
      <CategoryChip category={data.category} />
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
      <MetaField label="Questions about this update">
        <p className="font-medium">{data.contact.name}</p>
        <a href={`mailto:${data.contact.email}`} className="underline">
          {data.contact.email}
        </a>
      </MetaField>
      <Tabs defaultValue="comments">
        <TabsList variant="line">
          <TabsTrigger value="comments">
            Comments <Count n={data.comments.length} />
          </TabsTrigger>
          <TabsTrigger value="activity">
            Activity <Count n={data.activities.length + data.comments.length} />
          </TabsTrigger>
        </TabsList>
        <TabsContent value="comments" className="pt-3">
          <ActivityTimelineBody
            entries={data.comments.map(commentEntry)}
            composer={<AddCommentForm ticketId={id} />}
          />
        </TabsContent>
        <TabsContent value="activity" className="pt-3">
          <ActivityTimelineBody
            entries={[
              ...data.activities.map(activityEntry),
              ...data.comments.map(commentEntry),
            ]}
          />
        </TabsContent>
      </Tabs>
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
