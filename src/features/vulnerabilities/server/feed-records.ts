// Writes the records that EPSS and KEV enrichment keep on a vulnerability
import "server-only";
import { MetricType, type Prisma } from "@/generated/prisma";
import prisma from "@/lib/db";
import type { FeedSource } from "./records";

const METRIC_TYPE: Record<FeedSource, MetricType> = {
  FIRST_EPSS: MetricType.EPSS,
  CISA_KEV: MetricType.KEV,
};

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
 * Create or update a vulnerability's record from one feed, and its single metric. A vulnerability
 * has at most one record per feed: it is found by (vulnerability, source), not by CVE, so a
 * change of CVE updates the record's sourceId instead of adding a second record.
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
  const type = METRIC_TYPE[source];
  const values =
    metric.source === "FIRST_EPSS"
      ? { score: metric.score, percentile: metric.percentile, flag: null }
      : { score: null, percentile: null, flag: metric.inKev };

  return prisma.$transaction(async (tx) => {
    const existing = await tx.vulnerabilityRecord.findFirst({
      where: { vulnerabilityId, source },
      select: { id: true },
    });
    const record = existing
      ? await tx.vulnerabilityRecord.update({
          where: { id: existing.id },
          data: { sourceId: cve, ...(raw !== undefined ? { raw } : {}) },
          select: { id: true },
        })
      : await tx.vulnerabilityRecord.create({
          data: { vulnerabilityId, source, sourceId: cve, raw },
          select: { id: true },
        });

    await tx.metric.upsert({
      where: { recordId_type: { recordId: record.id, type } },
      create: { recordId: record.id, type, ...values },
      update: values,
    });
    return record;
  });
}
