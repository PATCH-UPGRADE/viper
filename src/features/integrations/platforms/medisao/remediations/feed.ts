import { z } from "zod";
import type { Session } from "../../../core/types";
import { walkPages, withSince } from "../paginate";
import { channelRemediationsUrl } from "../urls";
import { splitVersion } from "../version";

/**
 * One remediation as MedISAO sends it.
 *
 * Only the fields this sync depends on are required. Everything else is
 * nullish, because the dev instance carries a single hand-made record and its
 * nulls are not evidence that a field is always present in production.
 * Unknown keys are stripped.
 */
export const rawRemediationSchema = z.object({
  id: z.string(),
  channel: z.object({
    vendor: z.string(),
    product: z.string().nullish(),
  }),
  advisory_id: z.string().nullish(),
  version: z.string().nullish(),
  version_text: z.string().nullish(),
  tlp: z.string().nullish(),
  category: z.string().nullish(),
  mechanism: z.string().nullish(),
  description: z.string().nullish(),
  narrative: z.string().nullish(),
  fixed_vulnerabilities: z.array(z.string()).nullish(),
  requires_downtime: z.boolean().nullish(),
  estimated_downtime_seconds: z.number().int().nullish(),
  restart_required: z.boolean().nullish(),
  disables_features: z.boolean().nullish(),
  workflow_impact: z.string().nullish(),
  clinical_impact_notes: z.string().nullish(),
  files: z.array(z.unknown()).nullish(),
  updated_at: z.string(),
});
export type RawMedIsaoRemediation = z.infer<typeof rawRemediationSchema>;

/** The platform-neutral shape the ingest consumes. */
export interface MedIsaoRemediationItem {
  vendorId: string;
  upstreamApi: string | null;
  webUrl: string | null;

  manufacturer: string;
  product: string | null;
  /** Set when the feed gave a plain version string. */
  version: string | null;
  /** Set when the feed gave a VERS expression. Mutually exclusive with `version`. */
  versionRange: string | null;

  description: string | null;
  narrative: string | null;
  fixedVulnerabilities: string[];
  advisoryId: string | null;
  /** Manufacturer-stated impact, reshaped for `Remediation.sourceImpact`. */
  sourceImpact: MedIsaoSourceImpact;

  updatedAt: string;
  raw: RawMedIsaoRemediation;
}

export interface MedIsaoSourceImpact {
  category: string | null;
  mechanism: string | null;
  requiresDowntime: boolean | null;
  estimatedDowntimeSeconds: number | null;
  restartRequired: boolean | null;
  disablesFeatures: boolean | null;
  workflowImpact: string | null;
  clinicalImpactNotes: string | null;
}

/**
 * MedISAO answers the downtime question the manufacturer alone can answer.
 * Kept as sent — `category` and `mechanism` are their enums, and we hold only
 * one observed value of each, so neither is narrowed to a Prisma enum yet.
 */
export const toSourceImpact = (
  raw: RawMedIsaoRemediation,
): MedIsaoSourceImpact => ({
  category: raw.category ?? null,
  mechanism: raw.mechanism ?? null,
  requiresDowntime: raw.requires_downtime ?? null,
  estimatedDowntimeSeconds: raw.estimated_downtime_seconds ?? null,
  restartRequired: raw.restart_required ?? null,
  disablesFeatures: raw.disables_features ?? null,
  workflowImpact: raw.workflow_impact ?? null,
  clinicalImpactNotes: raw.clinical_impact_notes ?? null,
});

export const toCanonical = (
  raw: RawMedIsaoRemediation,
  apiUrl: string,
  channelId: string,
): MedIsaoRemediationItem => ({
  vendorId: raw.id,
  upstreamApi: channelRemediationsUrl(apiUrl, channelId),
  // MedISAO publishes no human-facing page for a remediation.
  webUrl: null,

  manufacturer: raw.channel.vendor,
  product: raw.channel.product ?? null,
  ...splitVersion(raw.version),

  description: raw.description ?? null,
  narrative: raw.narrative ?? null,
  fixedVulnerabilities: raw.fixed_vulnerabilities ?? [],
  advisoryId: raw.advisory_id ?? null,
  sourceImpact: toSourceImpact(raw),

  updatedAt: raw.updated_at,
  raw,
});

/** Every remediation on one channel that changed at or after `since`. */
export async function* listChanged(
  session: Session,
  apiUrl: string,
  channelId: string,
  since: Date | null,
): AsyncGenerator<MedIsaoRemediationItem[]> {
  const url = withSince(channelRemediationsUrl(apiUrl, channelId), since);
  for await (const page of walkPages(session, url, rawRemediationSchema)) {
    yield page.map((raw) => toCanonical(raw, apiUrl, channelId));
  }
}
