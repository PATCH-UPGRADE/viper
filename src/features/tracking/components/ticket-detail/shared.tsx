"use client";

import { format } from "date-fns";
import type React from "react";
import { Badge } from "@/components/ui/badge";
import { useCategoryColor } from "@/features/tag-colors/context";
import { getChipClass } from "@/features/tag-colors/palette";
import type { TicketCategory, TicketStatus } from "@/generated/prisma";
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

export const formatScheduled = (date: Date | string | null | undefined) => {
  if (!date) return null;
  const d = date instanceof Date ? date : new Date(date);
  return format(d, "MMM d, yyyy 'at' h:mm a");
};

export const MetadataRow = ({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) => (
  <div className="flex flex-col gap-1">
    <span className="text-xs uppercase tracking-wide text-muted-foreground">
      {label}
    </span>
    <div>{children}</div>
  </div>
);

export const CategoryChip = ({ category }: { category: TicketCategory }) => {
  const color = useCategoryColor(category);
  return (
    <Badge variant="outline" className={getChipClass(color)}>
      {categoryLabels[category]}
    </Badge>
  );
};

export const Section = ({
  title,
  children,
  count,
  trailing,
}: {
  title: React.ReactNode;
  count?: number;
  children: React.ReactNode;
  trailing?: React.ReactNode;
}) => (
  <section className="flex flex-col gap-3">
    <div className="flex items-center justify-between gap-2">
      <h2 className="text-sm font-semibold flex items-center gap-2">
        {title}
        {typeof count === "number" && (
          <Badge variant="secondary" className="text-xs">
            {count}
          </Badge>
        )}
      </h2>
      {trailing}
    </div>
    {children}
  </section>
);

export type DetailAsset = TicketDetail["assets"][number];
export type DetailRemediation = TicketDetail["remediations"][number];

export const formatLocation = (location: unknown): string => {
  if (!location || typeof location !== "object") return "—";
  const loc = location as Record<string, unknown>;
  const parts = [loc.building, loc.floor, loc.room].filter(
    (v): v is string => typeof v === "string" && v.length > 0,
  );
  return parts.length > 0 ? parts.join(" · ") : "—";
};

export const truncate = (s: string, n = 80) =>
  s.length > n ? `${s.slice(0, n - 1)}…` : s;
