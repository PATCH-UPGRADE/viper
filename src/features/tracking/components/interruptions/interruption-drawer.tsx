"use client";

import { format } from "date-fns";
import { ChevronDownIcon, ClockIcon, MonitorIcon } from "lucide-react";
import { useEffect, useRef } from "react";
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
} from "@/components/ui/sheet";
import { formatScheduled } from "@/lib/date-utils";
import { plural } from "@/lib/utils";
import { formatDuration, formatTimeRange } from "../../duration";
import { useInterruptionDetail } from "../../hooks/use-interruptions";
import { useInterruptionsParams } from "../../hooks/use-interruptions-params";
import { useMarkTicketSeen } from "../../hooks/use-tracking";
import type { getInterruptionDetail } from "../../server/interruptions";
import { commentEntry } from "../ticket-detail/activity-timeline";
import { AddCommentForm } from "../ticket-detail/add-comment-form";
import { RawJsonListCard } from "../ticket-detail/raw-json-list-card";
import { StatusChip } from "../ticket-detail/shared";

type Detail = Awaited<ReturnType<typeof getInterruptionDetail>>;

const Section = ({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) => (
  <section className="flex flex-col gap-2">
    <h3 className="text-sm font-semibold">{title}</h3>
    {children}
  </section>
);

const Label = ({ children }: { children: React.ReactNode }) => (
  <dt className="text-xs text-muted-foreground">{children}</dt>
);

const DrawerBody = ({ ticket }: { ticket: Detail }) => {
  const { scheduledAt, durationEstimate } = ticket;
  return (
    <div className="flex flex-col gap-6 px-4 pb-6">
      <div className="flex flex-col gap-2">
        <p className="flex items-center gap-2 text-sm font-medium">
          <MonitorIcon aria-hidden className="size-4 text-muted-foreground" />
          {ticket.assetName}
        </p>
        <StatusChip status={ticket.status} className="w-fit" />
      </div>

      <div className="rounded-lg border p-4">
        <dl className="grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-1">
            <Label>Schedule (according to work order)</Label>
            <dd className="text-sm font-medium">
              {scheduledAt
                ? `${format(scheduledAt, "EEE, MMM d")} · ${formatTimeRange(scheduledAt, durationEstimate)}`
                : "Not scheduled"}
            </dd>
          </div>
          <div className="flex flex-col gap-1">
            <Label>Estimated duration</Label>
            <dd className="flex items-center gap-1.5 text-sm font-medium">
              <ClockIcon aria-hidden className="size-4 text-muted-foreground" />
              {formatDuration(durationEstimate)}
            </dd>
          </div>
        </dl>
      </div>

      {ticket.otherDevices.length + ticket.otherDepartmentDeviceCount > 0 && (
        <Section title="Also getting this update">
          <div className="overflow-hidden rounded-lg border">
            <ul className="max-h-64 divide-y overflow-auto">
              {ticket.otherDevices.map((d) => (
                <li
                  key={d.id}
                  className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm"
                >
                  <span className="font-medium">{d.name}</span>
                  <span className="flex items-center gap-2 text-muted-foreground">
                    {d.scheduledAt
                      ? formatScheduled(d.scheduledAt)
                      : "Not scheduled"}
                    <StatusChip status={d.status} />
                  </span>
                </li>
              ))}
            </ul>
            {ticket.otherDepartmentDeviceCount > 0 && (
              <p className="border-t bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
                Plus {ticket.otherDepartmentDeviceCount}{" "}
                {plural("device", ticket.otherDepartmentDeviceCount)} in other
                departments.
              </p>
            )}
          </div>
        </Section>
      )}

      <Section title="Remediation">
        <RawJsonListCard
          items={ticket.remediations}
          emptyMessage="No remediation is linked to this ticket."
        />
      </Section>

      <Collapsible>
        <CollapsibleTrigger className="group flex items-center gap-1 text-sm font-medium">
          Read by {ticket.seenBy.length}
          <ChevronDownIcon
            aria-hidden
            className="size-4 transition-transform group-data-[state=open]:rotate-180"
          />
        </CollapsibleTrigger>
        <CollapsibleContent>
          <ul className="mt-2 flex flex-col gap-1 text-sm">
            {ticket.seenBy.map(({ user, seenAt }) => (
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
        entries={ticket.comments.map(commentEntry)}
        composer={<AddCommentForm ticketId={ticket.id} />}
      />
    </div>
  );
};

export const InterruptionDrawer = () => {
  const [{ ticket: ticketId }, setParams] = useInterruptionsParams();
  const { data: ticket, isError } = useInterruptionDetail(ticketId);
  const markSeen = useMarkTicketSeen();
  const opener = useRef<HTMLElement | null>(null);

  // Opening a ticket counts as reading it. Keyed on the id of the loaded
  // ticket, so it fires once per open, and only after the server has confirmed
  // this user may see it.
  // biome-ignore lint/correctness/useExhaustiveDependencies: `mutate` is stable
  useEffect(() => {
    if (ticket) markSeen.mutate({ ticketId: ticket.id });
  }, [ticket?.id]);

  return (
    <Sheet
      open={ticketId !== null}
      onOpenChange={(open) => {
        if (!open) setParams({ ticket: null });
      }}
    >
      <SheetContent
        className="w-full overflow-y-auto sm:max-w-xl"
        // The sheet is opened from the URL, not a Trigger, so Radix has
        // nothing to hand focus back to. Remember the entry that opened it.
        onOpenAutoFocus={() => {
          opener.current = document.activeElement as HTMLElement | null;
        }}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          opener.current?.focus();
        }}
      >
        <SheetHeader className="gap-2">
          <SheetTitle className="pr-6 text-lg">
            {ticket?.workOrder.summary ?? "Maintenance ticket"}
          </SheetTitle>
          <SheetDescription className="sr-only">
            Details, read receipts and comments for this maintenance ticket.
          </SheetDescription>
        </SheetHeader>
        {ticket ? (
          <DrawerBody ticket={ticket} />
        ) : (
          <p className="px-4 text-sm text-muted-foreground">
            {isError ? "This ticket isn't available." : "Loading..."}
          </p>
        )}
      </SheetContent>
    </Sheet>
  );
};
