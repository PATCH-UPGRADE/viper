// Helpers to create, update, or remove VulnerabilityRecords, creating Vulnerability as needed
import "server-only";
import { TRPCError } from "@trpc/server";
import { cvssBand } from "@/features/vulnerabilities/utils";
import {
  MetricType,
  type Prisma,
  type Severity,
  VulnerabilitySource,
} from "@/generated/prisma";
import prisma from "@/lib/db";
import { isUniqueViolation } from "@/lib/router-utils";
import { requireExistence } from "@/trpc/middleware";
import {
  CVE_PATTERN,
  computeDisplayId,
  findVulnerabilityByIdentifiers,
  mintViperIdentifier,
  type NormalizedIdentifier,
  normalizeIdentifiers,
  upsertIdentifiers,
} from "./identity";

export const CVSS_METRIC_TYPES: MetricType[] = [
  MetricType.CVSS_V3_0,
  MetricType.CVSS_V3_1,
  MetricType.CVSS_V4_0,
];

/**
 * Enrichment adds an EPSS and a KEV record to every vulnerability with a CVE. They describe a
 * vulnerability but never keep one alive: deleting its last other record deletes it.
 */
const FEED_SOURCES: VulnerabilitySource[] = [
  VulnerabilitySource.FIRST_EPSS,
  VulnerabilitySource.CISA_KEV,
];

/** The CVSS version a vector names. A score with no vector is assumed to be CVSS 3.1. */
export function cvssMetricType(vector?: string | null): MetricType {
  if (vector?.startsWith("CVSS:4.0")) return MetricType.CVSS_V4_0;
  if (vector?.startsWith("CVSS:3.0")) return MetricType.CVSS_V3_0;
  return MetricType.CVSS_V3_1;
}

export interface MetricInput {
  type: MetricType;
  vector?: string | null;
  score?: number | null;
  percentile?: number | null;
  severity?: Severity | null;
}

export interface Ta3SubmissionInput {
  sarif: Prisma.InputJsonValue;
  narrative?: string | null;
  impact?: string | null;
  exploitUri?: string | null;
  deviceArtifactId?: string | null;
}

export interface VulnerabilityRecordData {
  source: VulnerabilitySource;
  externalId?: string | null;
  /** CVE, GHSA, or other IDs. With none, the record gets a new vulnerability with a VIPER- ID. */
  identifiers?: string[];
  summary?: string | null;
  details?: string | null;
  publishedAt?: Date | null;
  metrics?: MetricInput[];
  /** Device rules the vulnerability affects. Added to the vulnerability, never removed. */
  deviceGroupMatchingIds?: string[];
  /** Only on a TA3 record. */
  ta3Submission?: Ta3SubmissionInput | null;
  /** The record's owner. When null, anyone may update or delete the record. */
  userId?: string | null;
}

export type VulnerabilityRecordPatch = Partial<
  Omit<VulnerabilityRecordData, "source" | "userId">
>;

const isCvss = (type: MetricType) => CVSS_METRIC_TYPES.includes(type);

function assertSubmissionMatchesSource(
  source: VulnerabilitySource,
  submission: Ta3SubmissionInput | null | undefined,
) {
  if (submission && source !== VulnerabilitySource.TA3) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `A TA3 submission can't be attached to a ${source} record`,
    });
  }
}

function toMetricCreate(
  metric: MetricInput,
): Prisma.MetricCreateWithoutRecordInput {
  return {
    type: metric.type,
    vector: metric.vector ?? null,
    score: metric.score ?? null,
    percentile: metric.percentile ?? null,
    severity:
      metric.severity ?? (isCvss(metric.type) ? cvssBand(metric.score) : null),
  };
}

function toSubmissionCreate(
  submission: Ta3SubmissionInput,
): Prisma.TA3SubmissionUncheckedCreateWithoutRecordInput {
  return {
    sarif: submission.sarif,
    narrative: submission.narrative ?? null,
    impact: submission.impact ?? null,
    exploitUri: submission.exploitUri ?? null,
    deviceArtifactId: submission.deviceArtifactId ?? null,
  };
}

/**
 * Add one source's statement about a vulnerability. The vulnerability is found by the record's
 * identifiers, or created when none of them is known yet.
 *
 * `actingUserId` only fills the legacy `Vulnerability.userId` column.
 * TODO: VW-540 remove `actingUserId` once `Vulnerability.userId` is dropped; ownership is
 * `data.userId` on the record.
 */
export async function createVulnerabilityRecord(
  data: VulnerabilityRecordData,
  { actingUserId }: { actingUserId: string },
) {
  assertSubmissionMatchesSource(data.source, data.ta3Submission);
  const identifiers = normalizeIdentifiers(data.identifiers ?? []);
  const { vulnerabilityId, created } = await findOrCreateVulnerability(
    data,
    identifiers,
    actingUserId,
  );

  let record: Awaited<ReturnType<typeof prisma.vulnerabilityRecord.create>>;
  try {
    record = await prisma.$transaction(async (tx) => {
      if (!created) await upsertIdentifiers(tx, vulnerabilityId, identifiers);
      return tx.vulnerabilityRecord.create({
        data: {
          vulnerabilityId,
          source: data.source,
          externalId: data.externalId ?? null,
          summary: data.summary ?? null,
          details: data.details ?? null,
          publishedAt: data.publishedAt ?? null,
          userId: data.userId ?? null,
          metrics: { create: (data.metrics ?? []).map(toMetricCreate) },
          ...(data.ta3Submission
            ? {
                ta3Submission: {
                  create: toSubmissionCreate(data.ta3Submission),
                },
              }
            : {}),
        },
      });
    });
  } catch (error) {
    // Don't leave behind a vulnerability with no records.
    if (created) {
      await prisma.vulnerability.deleteMany({ where: { id: vulnerabilityId } });
    }
    throw error;
  }

  await refreshVulnerability(vulnerabilityId, data.deviceGroupMatchingIds);
  return { record, vulnerabilityId, vulnerabilityCreated: created };
}

/**
 * Change one record. Lists that are given (metrics, identifiers) replace or extend what the
 * record has; fields that are omitted are left alone.
 */
export async function updateVulnerabilityRecord(
  recordId: string,
  patch: VulnerabilityRecordPatch,
) {
  const existing = requireExistence(
    await prisma.vulnerabilityRecord.findUnique({
      where: { id: recordId },
      select: { vulnerabilityId: true, source: true },
    }),
    "VulnerabilityRecord",
  );
  assertSubmissionMatchesSource(existing.source, patch.ta3Submission);
  const { vulnerabilityId } = existing;

  const record = await prisma.$transaction(async (tx) => {
    if (patch.identifiers) {
      await upsertIdentifiers(
        tx,
        vulnerabilityId,
        normalizeIdentifiers(patch.identifiers),
      );
    }
    if (patch.metrics) await tx.metric.deleteMany({ where: { recordId } });
    if (patch.ta3Submission) {
      const submission = toSubmissionCreate(patch.ta3Submission);
      await tx.tA3Submission.upsert({
        where: { recordId },
        create: { recordId, ...submission },
        update: submission,
      });
    }
    return tx.vulnerabilityRecord.update({
      where: { id: recordId },
      data: {
        externalId: patch.externalId,
        summary: patch.summary,
        details: patch.details,
        publishedAt: patch.publishedAt,
        ...(patch.metrics
          ? { metrics: { create: patch.metrics.map(toMetricCreate) } }
          : {}),
      },
    });
  });

  // TODO: VW-541 devices are only ever added: they sit on the vulnerability, not the record,
  // so one record can't remove a device another record added. Affected fixes this.
  await refreshVulnerability(vulnerabilityId, patch.deviceGroupMatchingIds);
  return { record, vulnerabilityId };
}

/** Delete one record, and its vulnerability too when no other non-feed record remains. */
export async function deleteVulnerabilityRecord(recordId: string) {
  const { vulnerabilityId } = requireExistence(
    await prisma.vulnerabilityRecord.findUnique({
      where: { id: recordId },
      select: { vulnerabilityId: true },
    }),
    "VulnerabilityRecord",
  );
  await prisma.vulnerabilityRecord.deleteMany({ where: { id: recordId } });

  // One statement, so two concurrent deletes of the last two records can't both miss it.
  const { count } = await prisma.vulnerability.deleteMany({
    where: {
      id: vulnerabilityId,
      records: { none: { source: { notIn: FEED_SOURCES } } },
    },
  });
  if (count === 0) await refreshVulnerability(vulnerabilityId);
  return { vulnerabilityId, vulnerabilityDeleted: count > 0 };
}

async function findOrCreateVulnerability(
  data: VulnerabilityRecordData,
  identifiers: NormalizedIdentifier[],
  actingUserId: string,
): Promise<{ vulnerabilityId: string; created: boolean }> {
  const values = identifiers.map((identifier) => identifier.value);
  const existing = await findVulnerabilityByIdentifiers(prisma, values);
  if (existing) return { vulnerabilityId: existing, created: false };

  const all = identifiers.length > 0 ? identifiers : [mintViperIdentifier()];
  // `all` is never empty, so there is always a display ID.
  const displayId = computeDisplayId(all) as string;
  const cvss = data.metrics?.find((metric) => isCvss(metric.type));
  const severity = (data.metrics ?? [])
    .map(toMetricCreate)
    .find(
      (metric) =>
        metric.severity &&
        (isCvss(metric.type) || metric.type === MetricType.QUALITATIVE),
    )?.severity;

  try {
    const row = await prisma.vulnerability.create({
      data: {
        displayId,
        identifiers: { create: all },
        description: data.details ?? data.summary ?? null,
        narrative: data.ta3Submission?.narrative ?? null,
        impact: data.ta3Submission?.impact ?? null,
        ...(severity ? { severity } : {}),
        // TODO: VW-540 legacy columns, still read by the UI, enrichment and inbox. Written at
        // create because vulnerabilityExtension starts enrichment, which reads cveId and
        // cvssScore, as soon as the row exists.
        cveId: CVE_PATTERN.test(displayId) ? displayId : null,
        cvssScore: cvss?.score ?? null,
        cvssVector: cvss?.vector ?? null,
        sarif: data.ta3Submission?.sarif ?? {},
        exploitUri: data.ta3Submission?.exploitUri ?? null,
        deviceArtifactId: data.ta3Submission?.deviceArtifactId ?? null,
        userId: actingUserId,
      },
      select: { id: true },
    });
    return { vulnerabilityId: row.id, created: true };
  } catch (error) {
    if (!isUniqueViolation(error) || values.length === 0) throw error;
    // A concurrent request created a vulnerability with one of these identifiers first.
    const winner = await findVulnerabilityByIdentifiers(prisma, values);
    if (!winner) throw error;
    return { vulnerabilityId: winner, created: false };
  }
}

/**
 * Bring a vulnerability in line with its records: attach new device rules (opening their
 * baseline Issues) and recompute its severity from the newest rated metric. Also bumps
 * updatedAt, which ALOHA polls on.
 */
async function refreshVulnerability(
  vulnerabilityId: string,
  deviceGroupMatchingIds: string[] = [],
) {
  const rated = await prisma.metric.findFirst({
    where: {
      record: { vulnerabilityId },
      type: { in: [...CVSS_METRIC_TYPES, MetricType.QUALITATIVE] },
      severity: { not: null },
    },
    orderBy: { updatedAt: "desc" },
    select: { severity: true },
  });
  const matchings = [...new Set(deviceGroupMatchingIds)].map((id) => ({ id }));

  await prisma.vulnerability.update({
    where: { id: vulnerabilityId },
    data: {
      // Explicit: with no new devices or severity the update is otherwise empty, and ALOHA and
      // the lastUpdated filters rely on the bump.
      updatedAt: new Date(),
      ...(matchings.length > 0
        ? { deviceGroupMatchings: { connect: matchings } }
        : {}),
      ...(rated?.severity ? { severity: rated.severity } : {}),
    },
  });

  // vulnerabilityExtension only opens baseline Issues on create, before any matching is
  // connected here, so open them for every matching this call attached.
  if (matchings.length > 0) {
    await prisma.issue.createMany({
      data: matchings.map(({ id }) => ({
        vulnerabilityId,
        deviceGroupMatchingId: id,
      })),
      skipDuplicates: true,
    });
  }
}
