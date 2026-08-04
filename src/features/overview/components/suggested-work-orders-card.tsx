"use client";

import { format } from "date-fns";
import { ListChecksIcon } from "lucide-react";
import { PriorityBadge } from "@/components/priority-badge";
import { StatusChip } from "@/features/tracking/components/ticket-detail/shared";
import { TicketStatus } from "@/generated/prisma";
import { useSuspenseSuggestedWorkOrders } from "../hooks/use-overview";
import {
  OverviewCard,
  OverviewCardEmpty,
  OverviewCardMeta,
  OverviewCardRow,
} from "./overview-card";

/** "completed <date>" once the ticket is done, otherwise its schedule. */
const scheduleLabel = (ticket: {
  status: TicketStatus;
  scheduledAt: Date | null;
  updatedAt: Date;
}) => {
  if (ticket.status === TicketStatus.DONE) {
    return `completed ${format(ticket.updatedAt, "MMM d")}`;
  }
  return ticket.scheduledAt
    ? `scheduled ${format(ticket.scheduledAt, "MMM d")}`
    : null;
};

export const SuggestedWorkOrdersCard = () => {
  const { data } = useSuspenseSuggestedWorkOrders();

  return (
    <OverviewCard
      icon={ListChecksIcon}
      title="Suggested Work Orders"
      description="Work orders, highest priority first"
      action={{ label: "All work orders", href: "/tracking" }}
    >
      {data.length === 0 && <OverviewCardEmpty message="No work orders yet." />}
      {data.map((ticket) => (
        <OverviewCardRow key={ticket.id} href={`/tracking/${ticket.id}`}>
          <div className="flex items-center gap-2">
            <PriorityBadge priority={ticket.priority} />
            <StatusChip status={ticket.status} />
            {ticket.isWatching && (
              <span className="text-xs text-muted-foreground">· Watching</span>
            )}
          </div>
          <p className="text-sm font-semibold">{ticket.summary}</p>
          <OverviewCardMeta
            parts={[
              ticket.isWatching ? "You watch this" : null,
              scheduleLabel(ticket),
              ticket.assignee?.name ?? null,
              `${ticket.assetCount} ${ticket.assetCount === 1 ? "asset" : "assets"}`,
            ]}
          />
        </OverviewCardRow>
      ))}
    </OverviewCard>
  );
};
