"use client";

import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";
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

export const statusOrder = Object.keys(statusLabels) as TicketStatus[];

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
