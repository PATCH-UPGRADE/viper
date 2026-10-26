"use client";

import { Badge } from "@/components/ui/badge";
import type { Severity } from "@/generated/prisma";

export const severityConfig: Record<
  Severity,
  { label: string; short: string; badgeClassName: string }
> = {
  Critical: {
    label: "Critical",
    short: "C",
    badgeClassName: "bg-red-600 hover:bg-red-600 text-white",
  },
  High: {
    label: "High",
    short: "H",
    badgeClassName: "bg-orange-500 hover:bg-orange-500 text-white",
  },
  Medium: {
    label: "Medium",
    short: "M",
    badgeClassName: "bg-yellow-500 hover:bg-yellow-500 text-black",
  },
  Low: {
    label: "Low",
    short: "L",
    badgeClassName: "bg-blue-500 hover:bg-blue-500 text-white",
  },
};

/** A vulnerability with no rated metric has no severity. */
export const SeverityBadge = ({ severity }: { severity: Severity | null }) => {
  if (!severity) return <Badge variant="outline">Unrated</Badge>;
  const config = severityConfig[severity];
  return <Badge className={config.badgeClassName}>{config.label}</Badge>;
};
