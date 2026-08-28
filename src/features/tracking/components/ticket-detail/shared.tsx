"use client";

import { format } from "date-fns";
import { SquareCheckBigIcon } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import {
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useCategoryColor } from "@/features/tag-colors/context";
import { getChipClass } from "@/features/tag-colors/palette";
import type { TicketCategory, TicketStatus } from "@/generated/prisma";
import { cn } from "@/lib/utils";
import type { TicketDetail } from "../../types";

export const statusLabels: Record<TicketStatus, string> = {
  TO_DO: "To Do",
  IN_PROGRESS: "In Progress",
  REQUIRES_APPROVAL: "Requires Approval",
  DONE: "Done",
};

export const statusHue: Record<TicketStatus, string> = {
  TO_DO: "gray",
  IN_PROGRESS: "blue",
  REQUIRES_APPROVAL: "yellow",
  DONE: "green",
};

const statusOrder = Object.keys(statusLabels) as TicketStatus[];

export const categoryLabels: Record<TicketCategory, string> = {
  PATCH: "Patch",
  CONFIG_CHANGE: "Config Change",
  VULN_REMEDIATION: "Vuln Remediation",
  ADVISORY_RESPONSE: "Advisory Response",
  CLINICAL_REVIEW: "Clinical Review",
  FIRMWARE_UPDATE: "Firmware Update",
  NETWORK_REMEDIATION: "Network Remediation",
  NEW_ASSET_PROCUREMENT: "New Asset Procurement",
  MAINTENANCE: "Maintenance",
  OTHER: "Other",
};

export const formatDate = (date: Date | string | null | undefined) => {
  if (!date) return null;
  const d = date instanceof Date ? date : new Date(date);
  return format(d, "MMM d, yyyy");
};

export const CategoryChip = ({ category }: { category: TicketCategory }) => {
  const color = useCategoryColor(category);
  return (
    <Badge variant="outline" className={getChipClass(color)}>
      {categoryLabels[category]}
    </Badge>
  );
};

export const StatusChip = ({
  status,
  className,
}: {
  status: TicketStatus;
  className?: string;
}) => (
  <Badge
    variant="outline"
    className={cn(getChipClass(statusHue[status]), className)}
  >
    {statusLabels[status]}
  </Badge>
);

// One row linking to another ticket — icon, truncated summary, assignee,
// status. Shared by sub-tickets.tsx (with a hover-reveal detach action) and
// related-work-orders.tsx (read-only, no action).
export const TicketRefRow = ({
  id,
  summary,
  status,
  assigneeName,
  action,
}: {
  id: string;
  summary: string;
  status: TicketStatus;
  assigneeName: string | null;
  action?: ReactNode;
}) => (
  <li className="group relative flex items-center py-2.5">
    <Link
      href={`/tracking/${id}`}
      className={cn(
        "flex min-w-0 flex-1 items-center gap-3",
        action &&
          "transition-[padding] group-hover:pr-8 group-focus-within:pr-8",
      )}
    >
      <SquareCheckBigIcon className="size-4 shrink-0 text-muted-foreground" />
      <span className="min-w-0 flex-1 truncate text-sm font-medium group-hover:underline">
        {summary}
      </span>
      <div className="flex shrink-0 items-center gap-3">
        <span className="text-xs text-muted-foreground">
          {assigneeName ?? "Unassigned"}
        </span>
        <StatusChip status={status} />
      </div>
    </Link>
    {action}
  </li>
);

// Trigger + option list for a ticket-status Select. Callers still own the
// <Select value={...} onValueChange={...}> wrapper — this only standardizes
// the trigger's coloring/labeling and the option list, since edit-form.tsx
// (labeled via id) and linked-assets-table.tsx (labeled via aria-label,
// no visible <Label>) need different labeling but the same options/colors.
export const TicketStatusSelectTrigger = ({
  status,
  id,
  size,
  colored = false,
}: {
  status: TicketStatus;
  id?: string;
  size?: "sm" | "default";
  colored?: boolean;
}) => (
  <>
    <SelectTrigger
      id={id}
      size={size}
      aria-label={id ? undefined : "Ticket status"}
      className={colored ? getChipClass(statusHue[status]) : undefined}
    >
      <SelectValue />
    </SelectTrigger>
    <SelectContent>
      {statusOrder.map((s) => (
        <SelectItem key={s} value={s}>
          {statusLabels[s]}
        </SelectItem>
      ))}
    </SelectContent>
  </>
);

export const DepartmentChips = ({
  departments,
}: {
  departments: { id: string; name: string; color: string | null }[];
}) => {
  if (departments.length === 0) {
    return <span className="text-muted-foreground">—</span>;
  }

  return (
    <div className="flex flex-wrap gap-1">
      {departments.map((department) => (
        <Badge
          key={department.id}
          variant="outline"
          className={getChipClass(department.color)}
        >
          {department.name}
        </Badge>
      ))}
    </div>
  );
};

export type DetailAssetTicket = TicketDetail["assets"][number];

// To Do → In Progress → Requires Approval → Done (doesn't mutate the input).
export const sortAssetTicketsByStatus = (
  assetTickets: DetailAssetTicket[],
): DetailAssetTicket[] =>
  [...assetTickets].sort(
    (a, b) =>
      statusOrder.indexOf(a.ticket.status) -
      statusOrder.indexOf(b.ticket.status),
  );

export const countAssetTicketsByStatus = (
  assetTickets: DetailAssetTicket[],
): { status: TicketStatus; count: number }[] =>
  statusOrder
    .map((status) => ({
      status,
      count: assetTickets.filter((a) => a.ticket.status === status).length,
    }))
    .filter((c) => c.count > 0);

export const formatLocation = (location: unknown): string => {
  if (!location || typeof location !== "object") return "—";
  const loc = location as Record<string, unknown>;
  const parts = [loc.building, loc.floor, loc.room].filter(
    (v): v is string => typeof v === "string" && v.length > 0,
  );
  return parts.length > 0 ? parts.join(" · ") : "—";
};
