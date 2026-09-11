"use client";

import type { SourceImpact } from "../types";

/** Seconds are what the source sends; hours are what someone plans around. */
function formatDowntime(seconds: number): string {
  if (seconds < 60) return `${seconds} seconds`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} minutes`;
  const hours = minutes / 60;
  const rounded = Math.round(hours * 10) / 10;
  return `${rounded} ${rounded === 1 ? "hour" : "hours"}`;
}

const yesNo = (value: boolean | null | undefined) =>
  value === null || value === undefined ? "Not stated" : value ? "Yes" : "No";

/** Whether a source answered any of it. Nothing to show if none of it did. */
export const hasStatedImpact = (impact: SourceImpact): boolean =>
  Object.values(impact).some(
    (value) => value !== null && value !== undefined && value !== "",
  );

/**
 * What the manufacturer said about applying this remediation, rather than what
 * a model estimated. Every field is optional, because no source is obliged to
 * answer, so each says "Not stated" instead of implying a no.
 */
export function RemediationImpact({ impact }: { impact: SourceImpact }) {
  const rows: { label: string; value: string }[] = [
    { label: "Requires downtime", value: yesNo(impact.requiresDowntime) },
    {
      label: "Estimated downtime",
      value:
        typeof impact.estimatedDowntimeSeconds === "number"
          ? formatDowntime(impact.estimatedDowntimeSeconds)
          : "Not stated",
    },
    { label: "Restart required", value: yesNo(impact.restartRequired) },
    { label: "Disables features", value: yesNo(impact.disablesFeatures) },
  ];

  return (
    <div className="flex flex-col gap-4">
      <dl className="grid grid-cols-1 gap-x-8 gap-y-2 sm:grid-cols-2">
        {rows.map((row) => (
          <div key={row.label} className="flex justify-between gap-4 text-sm">
            <dt className="text-muted-foreground">{row.label}</dt>
            <dd className="font-medium">{row.value}</dd>
          </div>
        ))}
      </dl>
      {impact.workflowImpact && (
        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            Workflow impact
          </p>
          <p className="text-sm whitespace-pre-wrap">{impact.workflowImpact}</p>
        </div>
      )}
      {impact.clinicalImpactNotes && (
        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            Clinical impact
          </p>
          <p className="text-sm whitespace-pre-wrap">
            {impact.clinicalImpactNotes}
          </p>
        </div>
      )}
    </div>
  );
}
