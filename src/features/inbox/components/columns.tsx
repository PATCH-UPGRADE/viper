"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { formatDistanceToNow } from "date-fns";
import { MailIcon } from "lucide-react";
import { PriorityBadge } from "@/components/priority-badge";
import { Badge } from "@/components/ui/badge";
import { SortableHeader } from "@/components/ui/data-table";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import { Pill } from "@/components/ui/pill";
import { deviceGroupMatchingLabel } from "@/lib/string-utils";
import type { NotificationWithRelations, RawEmailPayload } from "../types";
import { NotificationTypeBadge } from "./notification-type-badge";

// ---------------------------------------------------------------------------
// Source display helper
// ---------------------------------------------------------------------------

function SourceDisplay({
  source,
}: {
  source: NotificationWithRelations["sources"][number];
}) {
  const raw =
    source.channel === "Email" ? (source.raw as RawEmailPayload) : null;
  return (
    <span className="flex flex-col gap-0.5">
      <span className="flex items-center gap-1 text-sm">
        {source.channel === "Email" && (
          <MailIcon className="size-3 shrink-0 text-muted-foreground" />
        )}
        <span className="truncate max-w-[200px]">
          {raw?.from ?? source.channel}
        </span>
      </span>
      <span className="text-xs text-muted-foreground">
        {formatDistanceToNow(source.receivedAt, { addSuffix: true })}
      </span>
    </span>
  );
}

// ---------------------------------------------------------------------------
// Column definitions
// ---------------------------------------------------------------------------

export const notificationColumns: ColumnDef<NotificationWithRelations>[] = [
  {
    id: "priority",
    accessorKey: "priority",
    meta: { title: "Priority", headerClassName: "w-36" },
    header: ({ column }) => (
      <SortableHeader header="Priority" column={column} />
    ),
    cell: ({ row }) => {
      const { priority, priorityReasonWhy, reads } = row.original;
      const isUnread = reads.length === 0;
      const badge = priority ? (
        <PriorityBadge priority={priority} />
      ) : (
        <span className="text-muted-foreground">—</span>
      );
      return (
        <span className="flex items-center gap-1.5">
          {isUnread && (
            <span className="size-2 rounded-full bg-primary shrink-0" />
          )}
          {priorityReasonWhy ? (
            <HoverCard openDelay={200}>
              <HoverCardTrigger asChild>{badge}</HoverCardTrigger>
              <HoverCardContent className="w-72 text-sm">
                {priorityReasonWhy}
              </HoverCardContent>
            </HoverCard>
          ) : (
            badge
          )}
        </span>
      );
    },
  },

  {
    id: "summary",
    meta: { title: "Summary" },
    header: "Summary",
    cell: ({ row }) => {
      const { title, summary, type, createdAt, updatedAt, reads } =
        row.original;
      const displayText = title ?? summary ?? "—";
      const isUnread = reads.length === 0;
      return (
        <div className="flex flex-col gap-0.5 min-w-0">
          <p
            className={`truncate max-w-lg text-sm ${isUnread ? "font-semibold" : ""}`}
            title={displayText}
          >
            {displayText}
          </p>
          <div className="flex items-center gap-1 text-xs text-muted-foreground flex-wrap">
            <NotificationTypeBadge type={type} />
            <span>•</span>
            <span>{formatDistanceToNow(createdAt, { addSuffix: true })}</span>
            <span>•</span>
            <span>
              updated {formatDistanceToNow(updatedAt, { addSuffix: true })}
            </span>
          </div>
        </div>
      );
    },
  },

  {
    id: "assets",
    meta: { title: "Assets" },
    header: "Assets",
    cell: ({ row }) => {
      const { deviceGroupsMatchings } = row.original;
      if (deviceGroupsMatchings.length === 0) {
        return <span className="text-muted-foreground text-sm">—</span>;
      }
      return (
        <div className="flex flex-wrap gap-1">
          {deviceGroupsMatchings.map((mapping) => {
            const label = deviceGroupMatchingLabel(mapping.deviceGroupMatching);
            const count = mapping.assetCount;
            return (
              <Pill key={mapping.id} title={label} count={count}>
                {label}
              </Pill>
            );
          })}
        </div>
      );
    },
  },

  {
    id: "sources",
    meta: { title: "Sources" },
    header: "Sources",
    cell: ({ row }) => {
      const { sources } = row.original;
      if (sources.length === 0) {
        return <span className="text-muted-foreground text-sm">—</span>;
      }

      const [first, ...rest] = sources;
      return (
        <div className="flex items-center gap-1.5">
          <SourceDisplay source={first} />
          {rest.length > 0 && (
            <HoverCard openDelay={200}>
              <HoverCardTrigger asChild>
                <Badge
                  variant="secondary"
                  className="cursor-default shrink-0 text-xs self-start"
                >
                  +{rest.length}
                </Badge>
              </HoverCardTrigger>
              <HoverCardContent className="w-80 p-3">
                <div className="flex flex-col gap-2">
                  <p className="text-xs font-medium text-muted-foreground">
                    Additional sources
                  </p>
                  {rest.map((source) => {
                    const raw =
                      source.channel === "Email"
                        ? (source.raw as RawEmailPayload)
                        : null;
                    return (
                      <div
                        key={source.id}
                        className="flex items-center justify-between gap-3"
                      >
                        <span className="flex items-center gap-1 text-sm min-w-0">
                          {source.channel === "Email" && (
                            <MailIcon className="size-3 shrink-0 text-muted-foreground" />
                          )}
                          <span className="truncate">
                            {raw?.from ?? source.channel}
                          </span>
                        </span>
                        <span className="text-xs text-muted-foreground shrink-0">
                          {formatDistanceToNow(source.receivedAt, {
                            addSuffix: true,
                          })}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </HoverCardContent>
            </HoverCard>
          )}
        </div>
      );
    },
  },
];
