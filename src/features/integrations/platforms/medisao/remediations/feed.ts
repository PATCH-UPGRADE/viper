import { z } from "zod";
import type { RemediationImpactInput } from "@/features/remediations/impact";
import type { ReleaseScalars } from "@/features/remediations/release";
import { RemediationCategory } from "@/generated/prisma";
import { asDate } from "@/lib/date-utils";
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
  published_at: z.string().nullish(),
  updated_at: z.string(),
});
export type RawMedIsaoRemediation = z.infer<typeof rawRemediationSchema>;

/** The platform-neutral shape the ingest consumes. */
export interface MedIsaoRemediationItem {
  externalId: string;
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
  /** viper shape manufacturer-stated impact */
  impact: RemediationImpactInput;
  release: ReleaseScalars;
  updatedAt: string;
  raw: RawMedIsaoRemediation;
}

export const toRemediationImpact = (
  raw: RawMedIsaoRemediation,
): RemediationImpactInput => ({
  requiresDowntime: raw.requires_downtime ?? null,
  restartRequired: raw.restart_required ?? null,
  estimatedDowntimeSeconds:
    (raw.estimated_downtime_seconds ?? -1) >= 0
      ? raw.estimated_downtime_seconds
      : null,
  disablesFeatures: raw.disables_features ?? null,
});

const MEDISAO_CATEGORY = new Map<string, RemediationCategory>([
  ["firmware_patch", RemediationCategory.HARDWARE_PATCH],
]);

export const toRemediationCategory = (
  raw: RawMedIsaoRemediation,
): RemediationCategory | null =>
  MEDISAO_CATEGORY.get(raw.mechanism ?? "") ?? null;

export const toCanonical = (
  raw: RawMedIsaoRemediation,
  apiUrl: string,
  channelId: string,
): MedIsaoRemediationItem => ({
  externalId: raw.id,
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
  impact: toRemediationImpact(raw),
  release: {
    category: toRemediationCategory(raw),
    publishedAt: asDate(raw.published_at),
  },
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
