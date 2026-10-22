import type { inferOutput } from "@trpc/tanstack-react-query";
import { z } from "zod";
import { deviceTypeLabelSelect } from "@/features/assets/utils";
import { externalMappingSelect } from "@/features/integrations/core/urls";
import {
  MetricType,
  PlatformEnum,
  Priority,
  type Prisma,
  Severity,
  VulnerabilitySource,
} from "@/generated/prisma";
import {
  createPaginatedResponseSchema,
  paginationInputSchema,
} from "@/lib/pagination";
import {
  alohaResponseSchema,
  createIntegrationInputSchema,
  deviceGroupMatchingResponseSchema,
  deviceInputSchema,
  publishedAtSchema,
  safeUrlSchema,
  userIncludeSelect,
  userSchema,
} from "@/lib/schemas";
import type { trpc } from "@/trpc/server";
import { scopedNoteSchema } from "../notes/schemas";
import { remediationCardInclude } from "../remediations/types";

// Validation schemas
const severitySchema = z.enum(Object.values(Severity));

const canonicalRefInclude = {
  select: { canonicalName: true, canonicalDisplayName: true },
} as const;

/** Include for a DeviceGroupMatching with its canonical manufacturer/product/version. */
export const deviceGroupMatchingInclude = {
  include: {
    manufacturer: canonicalRefInclude,
    product: canonicalRefInclude,
    version: canonicalRefInclude,
  },
} as const;

/** EPSS and KEV come from their feeds, so API clients can only send scores. */
const apiMetricTypes = [
  MetricType.CVSS_V3_0,
  MetricType.CVSS_V3_1,
  MetricType.CVSS_V4_0,
  MetricType.QUALITATIVE,
] as const;

export const metricInputSchema = z.object({
  type: z.enum(apiMetricTypes),
  vector: z.string().min(1).nullish(), // "CVSS:3.1/AV:N/AC:L/..."
  score: z.number().min(0).max(10).nullish(),
  severity: severitySchema.nullish(),
});

export const ta3SubmissionInputSchema = z.object({
  // Required: Zod 4 treats a bare z.any() key as optional.
  sarif: z.json().refine((sarif) => sarif !== null, "sarif is required"),
  narrative: z.string().min(1).nullish(), // how it could be exploited
  impact: z.string().min(1).nullish(), // clinical impact
  exploitUri: safeUrlSchema.nullish(),
  deviceArtifactId: z.string().min(1).nullish(),
});

/**
 * One source's statement about a vulnerability. The vulnerability is found by `identifiers`, or
 * created when none of them is known yet.
 */
export const vulnerabilityRecordInputSchema = z.object({
  // NOTE: API clients may only send TA3 or OTHER for now. Widen this if other clients start
  // using VIPER's API endpoints. Omitted, it is TA3 with a ta3Submission and OTHER without.
  source: z
    .enum([VulnerabilitySource.TA3, VulnerabilitySource.OTHER])
    .optional(),
  sourceId: z.string().min(1).nullish(), // the statement's ID inside its source, e.g. GHSA-…
  identifiers: z.array(z.string().min(1)).optional(), // CVE, GHSA, or other public IDs
  summary: z.string().min(1).nullish(),
  details: z.string().min(1).nullish(),
  publishedAt: publishedAtSchema.nullish(),
  metrics: z.array(metricInputSchema).optional(),
  devices: z
    .array(deviceInputSchema)
    .min(1, "At least one device is required")
    .describe(
      "The affected devices. Each one names its version, a VERS range, or every version with vers:all/*.",
    ),
  // Only for a TA3 record, and required on one.
  ta3Submission: ta3SubmissionInputSchema.nullish(),
});
export type VulnerabilityRecordInput = z.infer<
  typeof vulnerabilityRecordInputSchema
>;

export const vulnerabilityRecordArrayInputSchema = z.object({
  records: z.array(vulnerabilityRecordInputSchema).nonempty(),
});

/** Fields left out are unchanged. `metrics` replaces the record's metrics; devices are added. */
export const vulnerabilityRecordUpdateInputSchema =
  vulnerabilityRecordInputSchema.omit({ source: true }).partial();
export type VulnerabilityRecordUpdateInput = z.infer<
  typeof vulnerabilityRecordUpdateInputSchema
>;

export const metricResponseSchema = z.object({
  id: z.string(),
  type: z.enum(MetricType),
  vector: z.string().nullable(),
  score: z.number().nullable(),
  percentile: z.number().nullable(),
  severity: severitySchema.nullable(),
});

export const ta3SubmissionResponseSchema = z.object({
  id: z.string(),
  recordId: z.string(),
  vulnerabilityId: z.string(),
  sarif: z.any(), // JSON data - Prisma JsonValue type
  narrative: z.string().nullable(),
  impact: z.string().nullable(),
  exploitUri: z.string().nullable(),
  deviceArtifactId: z.string().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
});
export type Ta3SubmissionResponse = z.infer<typeof ta3SubmissionResponseSchema>;

// TODO VW-541: devices move to AffectedReport, and show up in this response through it.
export const vulnerabilityRecordResponseSchema = z.object({
  id: z.string(),
  vulnerabilityId: z.string(),
  source: z.enum(VulnerabilitySource),
  sourceId: z.string().nullable(),
  summary: z.string().nullable(),
  details: z.string().nullable(),
  publishedAt: z.date().nullable(),
  userId: z.string().nullable(),
  metrics: z.array(metricResponseSchema),
  ta3Submission: ta3SubmissionResponseSchema.nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
});
export type VulnerabilityRecordResponse = z.infer<
  typeof vulnerabilityRecordResponseSchema
>;

export const vulnerabilityRecordDeleteResponseSchema = z.object({
  id: z.string(),
  vulnerabilityId: z.string(),
  /** True when this was the vulnerability's last record, so it was deleted too. */
  vulnerabilityDeleted: z.boolean(),
});

export const vulnerabilityRecordInclude = {
  metrics: { orderBy: { createdAt: "asc" } },
  ta3Submission: true,
} satisfies Prisma.VulnerabilityRecordInclude;

export const ta3SubmissionInclude = {
  record: { select: { vulnerabilityId: true } },
} satisfies Prisma.TA3SubmissionInclude;

/**
 * Prisma returns Decimal for metric scores; the API returns plain numbers. The rest is the row
 * as is: the output schema strips the fields the API doesn't return.
 */
export function toVulnerabilityRecordResponse(
  record: Prisma.VulnerabilityRecordGetPayload<{
    include: typeof vulnerabilityRecordInclude;
  }>,
): VulnerabilityRecordResponse {
  return {
    ...record,
    metrics: record.metrics.map((metric) => ({
      ...metric,
      score: metric.score?.toNumber() ?? null,
      percentile: metric.percentile?.toNumber() ?? null,
    })),
    ta3Submission: record.ta3Submission && {
      ...record.ta3Submission,
      vulnerabilityId: record.vulnerabilityId,
    },
  };
}

export const vulnerabilityIdentifierResponseSchema = z.object({
  value: z.string(), // trimmed + upper-cased, for lookup
  displayValue: z.string(), // as published
});

/** A record as it appears nested in a vulnerability response. */
export const vulnerabilityRecordWithUserResponseSchema =
  vulnerabilityRecordResponseSchema.extend({
    user: userSchema.nullable(),
  });

export const vulnerabilityResponseSchema = z.object({
  id: z.string(),
  displayId: z.string(), // best human-facing ID: CVE > GHSA > other > VIPER-
  description: z.string().nullable(),
  narrative: z.string().nullable(),
  impact: z.string().nullable(),
  severity: severitySchema,
  identifiers: z.array(vulnerabilityIdentifierResponseSchema),
  // TODO: VW-541 show metrics per product (Affected) instead of per record
  records: z.array(vulnerabilityRecordWithUserResponseSchema),
  createdAt: z.date(),
  updatedAt: z.date(),
  notes: z.array(scopedNoteSchema).optional(),

  // <Getting removed in VW-540>
  // Legacy flat fields, kept until the UI and other consumers read identifiers and records.
  cveId: z.string().nullable(),
  cvssScore: z.number().nullable(),
  cvssVector: z.string().nullable(),
  epss: z.number().nullable(),
  updatedEpss: z.date().nullable(),
  inKEV: z.boolean(),
  updatedInKev: z.date().nullable(),
  sarif: z.any(), // JSON data - Prisma JsonValue type
  exploitUri: z.string().nullable(),
  affectedComponents: z.array(z.string()),
  userId: z.string(),
  user: userSchema,
  deviceGroupMatchings: z.array(deviceGroupMatchingResponseSchema),
  externalMappings: z.array(
    z.object({
      externalId: z.string(),
      upstreamApi: z.string().nullable(),
      webUrl: z.string().nullable(),
      integration: z.object({
        id: z.string(),
        name: z.string(),
        platform: z.enum(PlatformEnum),
      }),
    }),
  ),
  // </Getting removed in VW-540>
});
export type VulnerabilityResponse = z.infer<typeof vulnerabilityResponseSchema>;

export const paginatedVulnerabilityResponseSchema =
  createPaginatedResponseSchema(vulnerabilityResponseSchema);

export const integrationVulnerabilityInputSchema = createIntegrationInputSchema(
  vulnerabilityRecordInputSchema,
);

export type VulnerabilitiesByPriorityCounts = inferOutput<
  typeof trpc.vulnerabilities.getPriorityMetricsInternal
>;

export const vulnerabilitiesByPriorityInputSchema =
  paginationInputSchema.extend({
    priority: z.enum(Object.values(Priority)),
  });

export const vulnerabilityInclude = {
  identifiers: {
    select: { value: true, displayValue: true },
    orderBy: { createdAt: "asc" },
  },
  records: {
    include: { ...vulnerabilityRecordInclude, user: userIncludeSelect },
    orderBy: { createdAt: "asc" },
  },
  // TODO: VW-540 legacy relations, removed with the flat fields above
  user: userIncludeSelect,
  deviceGroupMatchings: deviceGroupMatchingInclude,
  externalMappings: externalMappingSelect,
} satisfies Prisma.VulnerabilityInclude;

/** Converts each record's metric Decimals; the output schema strips the rest. */
export function toVulnerabilityResponse(
  vulnerability: Prisma.VulnerabilityGetPayload<{
    include: typeof vulnerabilityInclude;
  }>,
) {
  return {
    ...vulnerability,
    records: vulnerability.records.map((record) => ({
      ...toVulnerabilityRecordResponse(record),
      user: record.user,
    })),
  };
}

export const vulnerabilityByPriorityInclude = {
  user: userIncludeSelect,
  deviceGroupMatchings: deviceGroupMatchingInclude,
  externalMappings: externalMappingSelect,
  issues: {
    include: {
      asset: {
        select: {
          id: true,
          location: true,
          product: { select: deviceTypeLabelSelect },
        },
      },
    },
  },
  remediations: {
    include: remediationCardInclude,
  },
  _count: {
    select: {
      issues: true,
      remediations: true,
    },
  },
} satisfies Prisma.VulnerabilityInclude;

export type VulnerabilityWithRelations = Prisma.VulnerabilityGetPayload<{
  include: typeof vulnerabilityByPriorityInclude;
}>;

export const ta3SubmissionAlohaResponseSchema = z.object({
  ta3Submission: ta3SubmissionResponseSchema,
  aloha: alohaResponseSchema,
});

export const paginatedTa3SubmissionResponseSchema =
  createPaginatedResponseSchema(ta3SubmissionResponseSchema);
