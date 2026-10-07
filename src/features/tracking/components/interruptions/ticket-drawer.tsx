"use client";

import { useQuery } from "@tanstack/react-query";
import { addMinutes, format, isSameDay, isToday, isYesterday } from "date-fns";
import { MailIcon } from "lucide-react";
import Link from "next/link";
import { type ReactNode, useEffect } from "react";
import { ActivityTimelineBody } from "@/components/activity-timeline";
import { Badge } from "@/components/ui/badge";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { UserAvatar } from "@/components/user-avatar";
import { NotificationReadReceipts } from "@/features/inbox/components/notification-read-receipts";
import type { TicketStatus } from "@/generated/prisma";
import { formatScheduled } from "@/lib/date-utils";
import { cn } from "@/lib/utils";
import { useTRPC } from "@/trpc/client";
import { useMarkTicketSeen } from "../../hooks/use-tracking";
import type { Availability } from "../../types";
import {
  activityEntry,
  commentEntry,
} from "../ticket-detail/activity-timeline";
import { AddCommentForm } from "../ticket-detail/add-comment-form";
import {
  availabilityStyle,
  CategoryChip,
  END_PASSED,
  endPassed,
  StatusChip,
  statusLabels,
} from "../ticket-detail/shared";
import { RescheduleRequest } from "./reschedule-request";

export type DrawerTicket = {
  id: string;
  summary: string;
  status: TicketStatus;
  scheduledAt: Date | null;
  assetName: string;
  durationEstimate: number | null;
  availability: Availability | null;
};

const Count = ({ n }: { n: number }) => (
  <span className="rounded-full bg-muted px-1.5 text-xs">{n}</span>
);

// Only fetched while the drawer is open: the sheet's content mounts on open.
const Details = ({ ticket }: { ticket: DrawerTicket }) => {
  const { id, availability } = ticket;
  const trpc = useTRPC();
  const { data, isError } = useQuery(
    trpc.tracking.getInterruptionDetail.queryOptions({ id }),
  );
  const markSeen = useMarkTicketSeen();

  // Opening a ticket counts as reading its owner ticket, once the server has
  // confirmed the user may see it.
  const ownerId = data?.workOrderId;
  // biome-ignore lint/correctness/useExhaustiveDependencies: `mutate` is stable
  useEffect(() => {
    if (ownerId) markSeen.mutate({ ticketId: ownerId });
  }, [ownerId]);

  if (isError) {
    return (
      <p className="text-sm text-destructive">Could not load this ticket.</p>
    );
  }
  if (!data) return <p className="text-sm text-muted-foreground">Loading...</p>;
  const banner = availabilityStyle(availability);
  const start = ticket.scheduledAt;
  const end =
    start && ticket.durationEstimate
      ? addMinutes(start, ticket.durationEstimate)
      : null;
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <Link
          href={`/tracking/${data.workOrderId}`}
          className="text-primary hover:underline"
        >
          View work order
        </Link>
        <Popover>
          <PopoverTrigger className="flex items-center gap-2 rounded-md px-1 hover:bg-accent">
            <span className="flex -space-x-2">
              {data.seenBy.slice(0, 3).map(({ user }) => (
                <UserAvatar
                  key={user.id}
                  user={user}
                  className="size-6 border-2 border-background text-[10px]"
                />
              ))}
            </span>
            <span className="text-muted-foreground">
              {data.seenBy.length} read
            </span>
          </PopoverTrigger>
          <PopoverContent align="end" className="flex w-80 flex-col gap-2">
            <p className="text-xs text-muted-foreground">
              Opened by {data.seenBy.length}
            </p>
            {[
              ...Map.groupBy(data.seenBy, ({ seenAt }) =>
                isToday(seenAt)
                  ? "Today"
                  : isYesterday(seenAt)
                    ? "Yesterday"
                    : format(seenAt, "EEE, MMM d"),
              ),
            ].map(([day, readers]) => (
              <div key={day} className="flex flex-col gap-1.5">
                <p className="text-xs font-semibold">{day}</p>
                {readers.map(({ user, seenAt }) => (
                  <div key={user.id} className="flex items-center gap-2">
                    <UserAvatar user={user} className="size-6 text-[10px]" />
                    <span className="flex-1 truncate font-medium">
                      {user.name}
                      {user.id === data.viewerId && " (you)"}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {format(seenAt, "h:mm a")}
                    </span>
                  </div>
                ))}
              </div>
            ))}
          </PopoverContent>
        </Popover>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <StatusChip status={ticket.status} />
        <CategoryChip category={data.category} />
        {data.departments.map((department) => (
          <Badge key={department.id} variant="secondary">
            {department.name}
          </Badge>
        ))}
      </div>
      <div className="overflow-hidden rounded-lg border text-sm">
        <div className={cn("flex items-center gap-2 p-3", banner.className)}>
          <banner.Icon className="size-5 shrink-0" aria-hidden />
          <div>
            <p className="font-semibold">{banner.label}</p>
            <p className="text-xs">As recorded on the work order</p>
          </div>
        </div>
        <div className="bg-card p-3">
          <p className="text-xs text-muted-foreground">
            What technical systems does this work disrupt during maintenance
          </p>
          <p className="whitespace-pre-wrap">
            {data.disruption ?? "Not provided in the work order."}
          </p>
          {!availability && (
            <p className="mt-2 text-xs text-muted-foreground">
              The work order does not record whether this device can be used
              during the work. Plan as if it will be unavailable until the
              maintenance team confirms.
            </p>
          )}
        </div>
      </div>
      {endPassed(ticket) && end && (
        <div className="rounded-lg border bg-muted/40 p-3 text-xs">
          <p className="font-medium">{END_PASSED}</p>
          <p className="mt-1 text-muted-foreground">
            The work order estimated this would end at {format(end, "h:mm a")}.
            VIPER has no record of completion. The recorded status is{" "}
            {statusLabels[ticket.status]} and the recorded availability is{" "}
            {banner.label.toLowerCase()}. Neither changes until the maintenance
            team updates the work order.
          </p>
        </div>
      )}
      <div className="grid grid-cols-2 gap-3 rounded-lg border p-3 text-sm">
        {[
          [
            "Schedule (according to work order)",
            start
              ? `${format(start, "EEE, MMM d")} · ${format(start, "h:mm a")}${end ? ` – ${format(end, "h:mm a")}${isSameDay(start, end) ? "" : ` on ${format(end, "EEE, MMM d")}`}` : ""}`
              : "No time recorded in the work order",
            !start
              ? "You can suggest a time below."
              : end
                ? ""
                : "End time unknown: the work order has no estimate.",
          ],
          [
            "Estimated duration",
            ticket.durationEstimate
              ? `${ticket.durationEstimate} min`
              : "Unknown",
            ticket.durationEstimate
              ? "Per device, according to the work order"
              : "The work order has no estimate.",
          ],
        ].map(([label, value, sub]) => (
          <div key={label}>
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="font-medium">{value}</p>
            {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
          </div>
        ))}
      </div>
      <RescheduleRequest
        ticketId={id}
        scheduled={!!start}
        listed={start ? format(start, "EEE, MMM d · h:mm a") : "no time"}
        duration={ticket.durationEstimate}
        requests={data.rescheduleRequests}
      />
      <Section title="Why this work is needed">
        <p className="whitespace-pre-wrap text-muted-foreground">
          {data.why ?? "Not provided"}
        </p>
      </Section>
      <Section title="Changes after maintenance">
        <p className="whitespace-pre-wrap text-muted-foreground">
          {data.changesAfter ??
            "No changes to the device interface or clinical behavior."}
        </p>
      </Section>
      {data.otherDevices.length > 0 && (
        <Section
          title={
            data.isDeviceTicket
              ? "Also getting this update"
              : "Assets on this work order"
          }
        >
          <ul className="divide-y rounded-lg border">
            {data.otherDevices.map((device) => (
              <li
                key={device.id}
                className="flex flex-wrap items-center justify-between gap-2 px-3 py-2"
              >
                <span className="flex flex-col">
                  <span className="font-medium">{device.name}</span>
                  {device.place && (
                    <span className="text-xs text-muted-foreground">
                      {device.place}
                    </span>
                  )}
                </span>
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
          <div className="flex min-w-0 flex-1 flex-col">
            <span className="font-medium">{data.contact.name}</span>
            {data.contact.department && (
              <span className="text-xs text-muted-foreground">
                {data.contact.department.name}
              </span>
            )}
          </div>
          <a
            href={`mailto:${data.contact.email}`}
            className="flex items-center gap-1.5 text-primary hover:underline"
          >
            <MailIcon className="size-4" aria-hidden />
            {data.contact.email}
          </a>
        </div>
      </Section>
      <Tabs defaultValue="comments">
        <TabsList variant="line-primary">
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
            empty="No comments yet."
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
}) => {
  return (
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
};
