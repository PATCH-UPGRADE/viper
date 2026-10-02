"use client";

import { useQuery } from "@tanstack/react-query";
import { ChevronDownIcon } from "lucide-react";
import { type ReactNode, useEffect } from "react";
import { ActivityTimeline } from "@/components/activity-timeline";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
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
import { plural } from "@/lib/utils";
import { useTRPC } from "@/trpc/client";
import { useMarkTicketSeen } from "../../hooks/use-tracking";
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
  const markSeen = useMarkTicketSeen();

  // Opening a ticket counts as reading it: once per open, and only after the
  // server has confirmed this user may see it.
  const loaded = Boolean(data);
  // biome-ignore lint/correctness/useExhaustiveDependencies: `mutate` is stable
  useEffect(() => {
    if (loaded) markSeen.mutate({ ticketId: id });
  }, [loaded, id]);

  if (!data) return <p className="text-sm text-muted-foreground">Loading...</p>;
  return (
    <>
      <Field label="Contact">{data.contactName}</Field>
      <Field label="Why this work is needed">
        <p className="whitespace-pre-wrap">
          {data.whyNecessary ?? "Not provided"}
        </p>
      </Field>
      {(data.otherDevices.length > 0 ||
        data.otherDepartmentDeviceCount > 0) && (
        <Field label="Also getting this update">
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
            {data.otherDepartmentDeviceCount > 0 && (
              <li className="px-3 py-2 text-xs text-muted-foreground">
                Plus {data.otherDepartmentDeviceCount}{" "}
                {plural("device", data.otherDepartmentDeviceCount)} in other
                departments.
              </li>
            )}
          </ul>
        </Field>
      )}
      <Field label="Remediation">
        <RawJsonListCard
          items={data.remediations}
          emptyMessage="No remediation is linked to this ticket."
        />
      </Field>
      <Collapsible>
        <CollapsibleTrigger className="group flex items-center gap-1 text-sm font-medium">
          Read by {data.seenBy.length}
          <ChevronDownIcon
            aria-hidden
            className="size-4 transition-transform group-data-[state=open]:rotate-180"
          />
        </CollapsibleTrigger>
        <CollapsibleContent>
          <ul className="mt-2 flex flex-col gap-1 text-sm">
            {data.seenBy.map(({ user, seenAt }) => (
              <li key={user.id} className="flex justify-between gap-4">
                <span>{user.name}</span>
                <span className="text-muted-foreground">
                  {formatScheduled(seenAt)}
                </span>
              </li>
            ))}
          </ul>
        </CollapsibleContent>
      </Collapsible>
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
