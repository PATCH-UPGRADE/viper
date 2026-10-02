"use client";

import { cn } from "@/lib/utils";
import { formatDuration, formatTimeRange } from "../../duration";
import { useOpenTicket } from "../../hooks/use-interruptions-params";
import type { InterruptionCalendarItem } from "../../server/interruptions";
import { statusLabels } from "../ticket-detail/shared";

const timeLabel = (item: InterruptionCalendarItem) =>
  formatTimeRange(item.scheduledAt, item.durationEstimate);

// What every entry button shares: a full accessible name, a hover title, and
// opening the ticket. Status and read state are spelled out, never colour alone.
const useEntryButton = (item: InterruptionCalendarItem) => {
  const open = useOpenTicket();
  return {
    type: "button" as const,
    "aria-label": [
      item.summary,
      `device ${item.assetName}`,
      timeLabel(item),
      formatDuration(item.durationEstimate),
      statusLabels[item.status],
      item.unread ? "unread" : "read",
    ].join(", "),
    title: item.summary,
    onClick: () => open(item.id),
  };
};

type EntryProps = {
  item: InterruptionCalendarItem;
  className?: string;
  style?: React.CSSProperties;
};

export const UnreadDot = () => (
  <span aria-hidden className="size-2 shrink-0 rounded-full bg-primary" />
);

// A block in the day and week time grid. A short block clips its last lines;
// the full name is always on the button.
export const BlockEntry = ({ item, className, style }: EntryProps) => {
  const button = useEntryButton(item);
  return (
    <button
      {...button}
      style={style}
      className={cn(
        "absolute flex flex-col gap-0.5 overflow-hidden rounded-md border border-l-4 border-l-primary/70 bg-card px-1.5 py-0.5 text-left text-[11px] leading-tight shadow-xs hover:bg-accent focus-visible:z-10 focus-visible:outline-2 focus-visible:outline-ring",
        className,
      )}
    >
      <span
        className={cn(
          "flex items-center gap-1 truncate text-xs",
          item.unread ? "font-semibold" : "font-medium",
        )}
      >
        {item.unread && <UnreadDot />}
        <span className="truncate">{item.assetName}</span>
      </span>
      <span className="truncate text-muted-foreground">
        {timeLabel(item)}
        {item.durationEstimate === null && " · No estimate"}
      </span>
      <span className="truncate text-muted-foreground">
        {statusLabels[item.status]}
      </span>
    </button>
  );
};

// One line, for month cells.
export const CompactEntry = ({ item, className }: EntryProps) => {
  const button = useEntryButton(item);
  return (
    <button
      {...button}
      className={cn(
        "flex w-full items-center gap-1 rounded border bg-card px-1 py-0.5 text-left text-xs hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring",
        className,
      )}
    >
      {item.unread && <UnreadDot />}
      <span className="shrink-0 text-muted-foreground">
        {formatTimeRange(item.scheduledAt, null)}
      </span>
      <span className={cn("truncate", item.unread && "font-semibold")}>
        {item.assetName}
      </span>
    </button>
  );
};
