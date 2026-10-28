// Writes the records that EPSS and KEV enrichment keep on a vulnerability
import "server-only";
import { MetricType, type Prisma } from "@/generated/prisma";
import prisma from "@/lib/db";

/** The one metric a feed record holds. Fields the metric's type doesn't use are left null. */
export type FeedMetric =
  | { source: "FIRST_EPSS"; score: number; percentile: number | null }
  // TODO later: the catalog's dateAdded, dueDate and ransomware use need a `Metric.extra` column.
  | { source: "CISA_KEV"; inKev: boolean };

export interface FeedRecordInput {
  vulnerabilityId: string;
  /** The CVE the feed was queried with. Stored as the record's sourceId. */
  cve: string;
  metric: FeedMetric;
  /** The feed's payload for this CVE, when there is one worth keeping. */
  raw?: Prisma.InputJsonValue;
}

/**
 * Create or update a vulnerability's record from one feed, and its single metric. There is one
 * record per feed per CVE. Both writes are upserts on unique keys, which Prisma runs as
 * INSERT … ON CONFLICT, so overlapping runs can't duplicate rows.
 *
 * Every call updates the metric, which bumps its updatedAt: that is when the feed was last checked.
 */
export async function upsertFeedRecord({
  vulnerabilityId,
  cve,
  metric,
  raw,
}: FeedRecordInput) {
  const { source } = metric;
  const { type, ...values } =
    metric.source === "FIRST_EPSS"
      ? {
          type: MetricType.EPSS,
          score: metric.score,
          percentile: metric.percentile,
          flag: null,
        }
      : {
          type: MetricType.KEV,
          score: null,
          percentile: null,
          flag: metric.inKev,
        };

  await prisma.$transaction(async (tx) => {
    const record = await tx.vulnerabilityRecord.upsert({
      where: {
        source_sourceId_vulnerabilityId: {
          source,
          sourceId: cve,
          vulnerabilityId,
        },
      },
      create: { vulnerabilityId, source, sourceId: cve, raw },
      // An undefined raw leaves the stored payload alone.
      update: { raw },
      select: { id: true },
    });

    await tx.metric.upsert({
      where: { recordId_type: { recordId: record.id, type } },
      create: { recordId: record.id, type, ...values },
      update: values,
    });
  });
}
