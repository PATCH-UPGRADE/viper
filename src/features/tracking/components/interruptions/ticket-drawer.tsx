"use client";

import { useQuery } from "@tanstack/react-query";
import { ClockIcon, MailIcon, PhoneIcon } from "lucide-react";
import { type ReactNode, useEffect } from "react";
import { ActivityTimelineBody } from "@/components/activity-timeline";
import { Badge } from "@/components/ui/badge";
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
import { cn, plural } from "@/lib/utils";
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
  StatusChip,
} from "../ticket-detail/shared";
import { WorkOrderModal } from "./work-order-modal";

export type DrawerTicket = {
  id: string;
  summary: string;
  status: TicketStatus;
  scheduledAt: Date | null;
  assetName: string;
  place?: string | null;
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
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <WorkOrderModal workOrderId={data.workOrderId} />
        <NotificationReadReceipts receipts={data.seenBy} />
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
        <div>
          <p className="text-xs text-muted-foreground">
            Schedule (according to work order)
          </p>
          <p className="font-medium">
            {formatScheduled(ticket.scheduledAt) ?? "No time recorded"}
          </p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Estimated duration</p>
          <p className="flex items-center gap-1.5 font-medium">
            <ClockIcon className="size-4 text-muted-foreground" aria-hidden />
            {ticket.durationEstimate
              ? `${ticket.durationEstimate} min`
              : "Unknown"}
          </p>
          <p className="text-xs text-muted-foreground">
            Per device, according to the work order
          </p>
        </div>
      </div>
      <Section title="Why this work is needed">
        <p className="whitespace-pre-wrap text-muted-foreground">
          {data.why ?? "Not provided"}
        </p>
      </Section>
      {(data.otherDevices.length > 0 || data.elsewhere.devices > 0) && (
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
            {data.elsewhere.devices > 0 && (
              <li className="bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
                Plus {data.elsewhere.devices}{" "}
                {plural("device", data.elsewhere.devices)}{" "}
                {data.elsewhere.departments > 0
                  ? `in ${data.elsewhere.departments} other ${plural("department", data.elsewhere.departments)}`
                  : "outside your department"}
                .
              </li>
            )}
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
          <div className="flex flex-col items-end gap-1">
            {data.contact.phone && (
              <span className="flex items-center gap-1.5">
                <PhoneIcon className="size-4" aria-hidden />
                {data.contact.phone}
              </span>
            )}
            <a
              href={`mailto:${data.contact.email}`}
              className="flex items-center gap-1.5 text-primary hover:underline"
            >
              <MailIcon className="size-4" aria-hidden />
              {data.contact.email}
            </a>
          </div>
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
        <p className="font-medium">
          {ticket.assetName}
          {ticket.place && (
            <span className="ml-2 font-normal text-muted-foreground">
              {ticket.place}
            </span>
          )}
        </p>
        <Details ticket={ticket} />
      </div>
    </SheetContent>
  </Sheet>
);
