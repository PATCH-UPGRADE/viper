"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { format } from "date-fns";
import { HeartPulseIcon, MessageSquareIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { SortableHeader } from "@/components/ui/data-table";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useCategoryColor } from "@/features/tag-colors/context";
import { getChipClass } from "@/features/tag-colors/palette";
import { TicketCategory, TicketSource, TicketStatus } from "@/generated/prisma";
import { cn } from "@/lib/utils";
import type { TrackingTicketChildRow } from "../types";

const statusLabels: Record<TicketStatus, string> = {
  TO_DO: "To Do",
  IN_PROGRESS: "In Progress",
  REQUIRES_APPROVAL: "Requires Approval",
  DONE: "Done",
};

const statusHue: Record<TicketStatus, string> = {
  TO_DO: "gray",
  IN_PROGRESS: "blue",
  REQUIRES_APPROVAL: "yellow",
  DONE: "green",
};

const categoryLabels: Record<TicketCategory, string> = {
  PATCH: "Patch",
  CONFIG_CHANGE: "Config Change",
  VULN_REMEDIATION: "Vuln Remediation",
  ADVISORY_RESPONSE: "Advisory Response",
  CLINICAL_REVIEW: "Clinical Review",
  FIRMWARE_UPDATE: "Firmware Update",
  NETWORK_REMEDIATION: "Network Remediation",
  NEW_ASSET_PROCUREMENT: "New Asset Procurement",
  OTHER: "Other",
};

const CategoryChip = ({ category }: { category: TicketCategory }) => {
  const color = useCategoryColor(category);
  return (
    <Badge variant="outline" className={getChipClass(color)}>
      {categoryLabels[category]}
    </Badge>
  );
};

const sourceLabels: Record<TicketSource, string> = {
  WORKFLOW: "Workflow",
  MANUAL: "Manual",
  WEBHOOK: "Webhook",
  API: "API",
};

const formatScheduled = (date: Date | string | null | undefined) => {
  if (!date) return "—";
  const d = date instanceof Date ? date : new Date(date);
  return format(d, "MMM d, h:mm a");
};

const formatShortDate = (date: Date | string | null | undefined) => {
  if (!date) return "—";
  const d = date instanceof Date ? date : new Date(date);
  return format(d, "MMM d");
};

const COMPLETED_STATUSES: TicketStatus[] = [TicketStatus.DONE];

export const trackingColumns: ColumnDef<TrackingTicketChildRow>[] = [
  {
    id: "summary",
    accessorKey: "summary",
    header: ({ column }) => <SortableHeader header="Summary" column={column} />,
    cell: ({ row }) => {
      const children = (
        row.original as TrackingTicketChildRow & {
          children?: TrackingTicketChildRow[];
        }
      ).children;
      const total = children?.length ?? 0;
      const completed =
        children?.filter((c) => COMPLETED_STATUSES.includes(c.status)).length ??
        0;
      const pct = total > 0 ? (completed / total) * 100 : 0;
      const isComplete = total > 0 && completed === total;

      return (
        <div className="flex flex-col gap-1 min-w-0 max-w-96">
          <div className="flex items-center gap-2">
            {row.original.lifeSafety && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <HeartPulseIcon
                    className="size-4 text-destructive shrink-0"
                    aria-label="Life safety"
                  />
                </TooltipTrigger>
                <TooltipContent>Life-safety impacted</TooltipContent>
              </Tooltip>
            )}
            <span className="font-medium truncate">{row.original.summary}</span>
          </div>
          {total > 0 && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span>
                {completed}/{total}
              </span>
              <div className="h-1.5 w-24 overflow-hidden rounded-full bg-muted-foreground/25">
                <div
                  className={cn(
                    "h-full transition-all",
                    isComplete ? "bg-green-500" : "bg-blue-500",
                  )}
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          )}
        </div>
      );
    },
  },
  {
    id: "status",
    accessorKey: "status",
    header: "Status",
    cell: ({ row }) => (
      <Badge
        variant="outline"
        className={getChipClass(statusHue[row.original.status])}
      >
        {statusLabels[row.original.status]}
      </Badge>
    ),
  },
  {
    id: "category",
    accessorKey: "category",
    header: "Category",
    cell: ({ row }) => <CategoryChip category={row.original.category} />,
  },
  {
    id: "dept",
    header: "Dept",
    cell: ({ row }) => {
      const depts = row.original.departments;
      if (!depts || depts.length === 0)
        return <span className="text-muted-foreground">—</span>;
      return (
        <div className="flex flex-wrap gap-1">
          {depts.map((d) => (
            <Badge
              key={d.id}
              variant="outline"
              className={getChipClass(d.color)}
            >
              {d.name}
            </Badge>
          ))}
        </div>
      );
    },
  },
  {
    id: "assignee",
    header: "Assignee",
    cell: ({ row }) => row.original.assignee?.name ?? "Unassigned",
  },
  {
    id: "scheduled",
    accessorKey: "scheduledAt",
    header: ({ column }) => (
      <SortableHeader header="Scheduled" column={column} />
    ),
    cell: ({ row }) => formatScheduled(row.original.scheduledAt),
  },
  {
    id: "linked",
    header: "Linked",
    cell: ({ row }) => {
      const preview = row.original.linkedPreview ?? [];
      const total = row.original.linkedCount;
      const shown = preview.slice(0, 2);
      const more = Math.max(0, total - shown.length);
      if (total === 0) {
        return <span className="text-muted-foreground">—</span>;
      }
      return (
        <div className="flex flex-col items-start gap-1">
          {shown.map((item) => (
            <Badge
              key={item.id}
              variant="secondary"
              className="font-mono text-[10px] max-w-40 truncate border-border/60"
            >
              {item.label}
            </Badge>
          ))}
          {more > 0 && (
            <Badge variant="secondary" className="text-[10px] border-border/60">
              +{more}
            </Badge>
          )}
        </div>
      );
    },
  },
  {
    id: "comments",
    header: "Comments",
    cell: ({ row }) => (
      <div className="flex items-center gap-1 text-muted-foreground">
        <MessageSquareIcon className="size-3.5" />
        <span>{row.original.commentCount}</span>
      </div>
    ),
  },
  {
    id: "source",
    header: "Source",
    cell: ({ row }) => {
      const source = sourceLabels[row.original.source];
      if (
        row.original.source === TicketSource.WORKFLOW &&
        row.original.sourceWorkflow
      ) {
        return (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="text-muted-foreground">{source}</span>
            </TooltipTrigger>
            <TooltipContent>{row.original.sourceWorkflow.name}</TooltipContent>
          </Tooltip>
        );
      }
      return <span className="text-muted-foreground">{source}</span>;
    },
  },
  {
    id: "created",
    accessorKey: "createdAt",
    header: ({ column }) => <SortableHeader header="Created" column={column} />,
    cell: ({ row }) => formatShortDate(row.original.createdAt),
  },
  {
    id: "updated",
    accessorKey: "updatedAt",
    header: ({ column }) => <SortableHeader header="Updated" column={column} />,
    cell: ({ row }) => formatShortDate(row.original.updatedAt),
  },
];
