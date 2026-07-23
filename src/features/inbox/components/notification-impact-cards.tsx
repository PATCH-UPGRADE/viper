"use client";

import { HeartIcon } from "lucide-react";
import {
  CollapsibleCard,
  CollapsibleCardContent,
  CollapsibleCardTrigger,
} from "@/components/ui/collapsible-card";
import {
  hospitalImpactSchema,
  type NotificationDetailWithRelations,
} from "../types";

/**
 * Hospital impact + summary render on both the Respond and Details tabs, so
 * they live here rather than inside either tab.
 */

export function HospitalImpactCard({
  notification,
}: {
  notification: NotificationDetailWithRelations;
}) {
  // {} is truthy — treat an empty/invalid object as "not triaged yet".
  const impactParse = hospitalImpactSchema.safeParse(
    notification.hospitalImpact,
  );
  const impact = impactParse.success ? impactParse.data : null;
  const hasImpact =
    impact !== null &&
    (impact.byline.trim() !== "" || impact.impactStatement.trim() !== "");

  if (!hasImpact || !impact) return null;

  return (
    <CollapsibleCard defaultOpen>
      <CollapsibleCardTrigger>
        <HeartIcon className="size-4" />
        Hospital Impact
      </CollapsibleCardTrigger>
      <CollapsibleCardContent>
        <div className="flex flex-col gap-4">
          {impact.byline && (
            <p className="font-semibold leading-snug">{impact.byline}</p>
          )}
          {impact.impactStatement && (
            <p className="text-sm leading-relaxed text-muted-foreground">
              {impact.impactStatement}
            </p>
          )}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="rounded-lg border p-3">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Care Areas
              </p>
              <p className="mt-1 text-sm font-medium">
                {impact.careAreas || "—"}
              </p>
            </div>
            <div className="rounded-lg border p-3">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Likelihood
              </p>
              <p className="mt-1 text-sm font-medium">
                {impact.likelihood || "—"}
              </p>
            </div>
          </div>
        </div>
      </CollapsibleCardContent>
    </CollapsibleCard>
  );
}

export function NotificationSummaryCard({
  notification,
}: {
  notification: NotificationDetailWithRelations;
}) {
  if (!notification.summary) return null;

  return (
    <CollapsibleCard defaultOpen>
      <CollapsibleCardTrigger>Summary</CollapsibleCardTrigger>
      <CollapsibleCardContent>
        <p className="text-sm leading-relaxed">{notification.summary}</p>
      </CollapsibleCardContent>
    </CollapsibleCard>
  );
}
