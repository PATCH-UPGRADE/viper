"use client";

import type {
  ImpactEffect,
  ImpactPhase,
  RemediationMechanism,
} from "@/generated/prisma";
import type { RemediationResponse } from "../types";

/** Seconds are what the source sends; hours are what someone plans around. */
export function formatDowntime(seconds: number): string {
  if (seconds < 60) return `${seconds} ${seconds === 1 ? "second" : "seconds"}`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} ${minutes === 1 ? "minute" : "minutes"}`;
  const hours = minutes / 60;
  const rounded = Math.round(hours * 10) / 10;
  return `${rounded} ${rounded === 1 ? "hour" : "hours"}`;
}

const yesNo = (value: boolean | null | undefined) =>
  value === null || value === undefined ? "Not stated" : value ? "Yes" : "No";

const duration = (seconds: number | null | undefined) =>
  typeof seconds === "number" ? formatDowntime(seconds) : "Not stated";

const MECHANISM_LABEL: Record<RemediationMechanism, string> = {
  REMOTE_DEPLOYMENT: "Remote deployment",
  ON_SITE: "On-site technician",
  REMOVABLE_MEDIA: "Removable media (e.g. USB)",
  OTHER: "Other",
};

const EFFECT_LABEL: Record<ImpactEffect, string> = {
  UNAVAILABLE: "unavailable",
  DEGRADED: "degraded",
  CHANGED: "changed",
};

const PHASE_LABEL: Record<ImpactPhase, string> = {
  DURING_APPLY: "While it is applied",
  AFTER_APPLY: "After it is applied",
};

/**
 * What a source said about applying this remediation, rather than what a model
 * estimated. Every field is optional, so each says "Not stated" instead of implying
 * a no.
 */
export function MedIsaoRemediationImpact({
  remediation: r,
}: {
  remediation: RemediationResponse;
}) {
  const rows: { label: string; value: string }[] = [
    {
      label: "How it is applied",
      value: r.mechanism ? MECHANISM_LABEL[r.mechanism] : "Not stated",
    },
    { label: "Time to apply", value: duration(r.estimatedDurationSeconds) },
    { label: "Requires downtime", value: yesNo(r.requiresDowntime) },
    {
      label: "Estimated downtime",
      value: duration(r.estimatedDowntimeSeconds),
    },
    { label: "Restart required", value: yesNo(r.restartRequired) },
    { label: "Disables features", value: yesNo(r.disablesFeatures) },
    { label: "Can be rolled back", value: yesNo(r.reversible) },
    { label: "Verification required", value: yesNo(r.verificationRequired) },
  ];

  const phases = (["DURING_APPLY", "AFTER_APPLY"] as const)
    .map((phase) => ({
      phase,
      impacts: r.impacts.filter((impact) => impact.phase === phase),
    }))
    .filter((group) => group.impacts.length > 0);

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
      {phases.map(({ phase, impacts }) => (
        <div key={phase}>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            {PHASE_LABEL[phase]}
          </p>
          <ul className="flex flex-col gap-1 text-sm">
            {impacts.map((impact) => (
              <li key={impact.id}>
                <span className="font-medium">{impact.feature}</span>{" "}
                {EFFECT_LABEL[impact.effect]}
                {impact.clinicalWorkflowImpact &&
                  " (tell clinicians in advance)"}
                {impact.notes && (
                  <span className="text-muted-foreground">
                    : {impact.notes}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      ))}
      {r.verificationNotes && (
        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            Verification
          </p>
          <p className="text-sm whitespace-pre-wrap">{r.verificationNotes}</p>
        </div>
      )}
    </div>
  );
}
