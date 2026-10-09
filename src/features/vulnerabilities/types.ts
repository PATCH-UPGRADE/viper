import type { inferOutput } from "@trpc/tanstack-react-query";
import { z } from "zod";
import { externalMappingSelect } from "@/features/integrations/core/urls";
import {
  MetricType,
  PlatformEnum,
  Priority,
  type Prisma,
  Severity,
  type TA3Submission,
  VulnerabilitySource,
} from "@/generated/prisma";
import { parseVers } from "@/lib/device-matching";
import {
  createPaginatedResponseSchema,
  paginationInputSchema,
} from "@/lib/pagination";
import {
  alohaResponseSchema,
  createIntegrationInputSchema,
  deviceGroupMatchingResponseSchema,
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

/** One affected product. Resolved to a shared DeviceGroupMatching server-side. */
export const deviceInputSchema = z.object({
  manufacturer: z.string().min(1),
  product: z.string().min(1).nullish(),
  version: z.string().min(1).nullish(),
  versionRange: z
    .string()
    .min(1)
    .refine((range) => parseVers(range) !== null, {
      message: 'Not a VERS range, e.g. "vers:semver/<12.3"',
    })
    .nullish(),
});

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
  externalId: z.string().min(1).nullish(), // the statement's ID inside its source
  identifiers: z.array(z.string().min(1)).optional(), // CVE, GHSA, or other public IDs
  summary: z.string().min(1).nullish(),
  details: z.string().min(1).nullish(),
  publishedAt: z.iso.datetime({ offset: true }).nullish(),
  metrics: z.array(metricInputSchema).optional(),
  devices: z.array(deviceInputSchema).min(1, "At least one device is required"),
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

export const vulnerabilityRecordResponseSchema = z.object({
  id: z.string(),
  vulnerabilityId: z.string(),
  source: z.enum(VulnerabilitySource),
  externalId: z.string().nullable(),
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

export function toTa3SubmissionResponse(
  submission: TA3Submission,
  vulnerabilityId: string,
): Ta3SubmissionResponse {
  return {
    id: submission.id,
    recordId: submission.recordId,
    vulnerabilityId,
    sarif: submission.sarif,
    narrative: submission.narrative,
    impact: submission.impact,
    exploitUri: submission.exploitUri,
    deviceArtifactId: submission.deviceArtifactId,
    createdAt: submission.createdAt,
    updatedAt: submission.updatedAt,
  };
}

/** Prisma returns Decimal for metric scores; the API returns plain numbers. */
export function toVulnerabilityRecordResponse(
  record: Prisma.VulnerabilityRecordGetPayload<{
    include: typeof vulnerabilityRecordInclude;
  }>,
): VulnerabilityRecordResponse {
  return {
    id: record.id,
    vulnerabilityId: record.vulnerabilityId,
    source: record.source,
    externalId: record.externalId,
    summary: record.summary,
    details: record.details,
    publishedAt: record.publishedAt,
    userId: record.userId,
    metrics: record.metrics.map((metric) => ({
      id: metric.id,
      type: metric.type,
      vector: metric.vector,
      score: metric.score?.toNumber() ?? null,
      percentile: metric.percentile?.toNumber() ?? null,
      severity: metric.severity,
    })),
    ta3Submission: record.ta3Submission
      ? toTa3SubmissionResponse(record.ta3Submission, record.vulnerabilityId)
      : null,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

export const vulnerabilityResponseSchema = z.object({
  id: z.string(),
  displayId: z.string(), // best human-facing ID: CVE > GHSA > other > VIPER-
  sarif: z.any(), // JSON data - Prisma JsonValue type
  deviceGroupMatchings: z.array(deviceGroupMatchingResponseSchema),
  exploitUri: z.string().nullable(),
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
  description: z.string().nullable(),
  narrative: z.string().nullable(),
  impact: z.string().nullable(),
  cveId: z.string().nullable(),
  cvssScore: z.number().nullable(),
  severity: severitySchema,
  affectedComponents: z.array(z.string()),
  cvssVector: z.string().nullable(),
  epss: z.number().nullable(),
  updatedEpss: z.date().nullable(),
  inKEV: z.boolean(),
  updatedInKev: z.date().nullable(),
  userId: z.string(),
  createdAt: z.date(),
  updatedAt: z.date(),
  user: userSchema,
  notes: z.array(scopedNoteSchema).optional(),
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
  user: userIncludeSelect,
  deviceGroupMatchings: deviceGroupMatchingInclude,
  externalMappings: externalMappingSelect,
};

export const vulnerabilityByPriorityInclude = {
  user: userIncludeSelect,
  deviceGroupMatchings: deviceGroupMatchingInclude,
  externalMappings: externalMappingSelect,
  issues: {
    include: {
      asset: {
        select: {
          id: true,
          role: true,
          location: true,
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
