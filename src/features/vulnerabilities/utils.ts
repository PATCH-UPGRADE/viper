import {
  type Metric,
  MetricType,
  Severity,
  VulnerabilitySource,
} from "@/generated/prisma";
import { type MetricResponse, toMetricResponse } from "./types";

// computeVulnerabilityPriority checking against 7
// The band is from https://www.first.org/cvss/v3.1/specification-document section 5
export function cvssBand(score: number | null | undefined): Severity | null {
  if (score == null || score <= 0) return null;
  if (score >= 9) return Severity.Critical;
  if (score >= 7) return Severity.High;
  if (score >= 4) return Severity.Medium;
  return Severity.Low;
}

export const CVSS_METRIC_TYPES: MetricType[] = [
  MetricType.CVSS_V3_0,
  MetricType.CVSS_V3_1,
  MetricType.CVSS_V4_0,
];

/**
 * Enrichment adds an EPSS and a KEV record to every vulnerability with a CVE. They describe a
 * vulnerability but never keep one alive: deleting its last other record deletes it.
 */
export const FEED_SOURCES: VulnerabilitySource[] = [
  VulnerabilitySource.FIRST_EPSS,
  VulnerabilitySource.CISA_KEV,
];

export const VULNERABILITY_SOURCE_LABELS: Record<VulnerabilitySource, string> =
  {
    TA3: "TA3",
    VENDOR_ADVISORY: "Vendor advisory",
    AI: "AI crawler",
    OTHER: "Other",
    FIRST_EPSS: "FIRST EPSS",
    CISA_KEV: "CISA KEV",
  };

export type CvssMetric = Extract<MetricResponse, { vector: string | null }>;
type EpssMetric = Extract<MetricResponse, { percentile: number | null }>;
type KevMetric = Extract<MetricResponse, { inKev: boolean | null }>;

/** The one value of each kind a vulnerability shows, out of every metric its records hold. */
export interface MetricSummary {
  cvss: Pick<CvssMetric, "type" | "score" | "vector" | "severity"> | null;
  epss: Pick<EpssMetric, "score" | "percentile" | "updatedAt"> | null;
  /** `updatedAt` is when the KEV catalog was last checked for this CVE. */
  kev: Pick<KevMetric, "inKev" | "updatedAt"> | null;
}

const newestFirst = <T extends { updatedAt: Date }>(metrics: T[]): T[] =>
  [...metrics].sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());

/**
 * Every CVSS metric that has a score, newest first. The first is the one a vulnerability shows:
 * newest is the latest updatedAt, the same rule enrichment and the vulnerability's severity use.
 * TODO: VW-540 replace "newest CVSS wins" once there's a precedence rule between sources.
 */
export function cvssScores<M extends MetricResponse>(
  metrics: M[],
): Extract<M, CvssMetric>[] {
  return newestFirst(
    metrics.filter(
      (metric): metric is Extract<M, CvssMetric> =>
        CVSS_METRIC_TYPES.includes(metric.type) &&
        (metric as CvssMetric).score !== null,
    ),
  );
}

/**
 * Pick the newest CVSS (with a score), EPSS and KEV metric across a vulnerability's records.
 * Returns the metrics themselves, so anything the caller attached (such as their record) comes
 * along.
 */
export function summarizeMetrics<M extends MetricResponse>(metrics: M[]) {
  return {
    cvss: cvssScores(metrics)[0] ?? null,
    epss:
      newestFirst(
        metrics.filter(
          (metric): metric is Extract<M, EpssMetric> => metric.type === "EPSS",
        ),
      )[0] ?? null,
    kev:
      newestFirst(
        metrics.filter(
          (metric): metric is Extract<M, KevMetric> => metric.type === "KEV",
        ),
      )[0] ?? null,
  } satisfies MetricSummary;
}

/** summarizeMetrics for records loaded straight from Prisma, whose scores are Decimals. */
export const summarizeRecordMetrics = (records: { metrics: Metric[] }[]) =>
  summarizeMetrics(
    records.flatMap((record) => record.metrics.map(toMetricResponse)),
  );

interface RecordLike {
  source: VulnerabilitySource;
  user?: { name: string } | null;
}

/**
 * Where a vulnerability came from: its records' sources in order, without the EPSS and KEV feeds,
 * and the people who sent its TA3 records.
 */
export function recordSources(records: RecordLike[]): {
  sources: VulnerabilitySource[];
  ta3Contributors: string[];
} {
  const sources = [
    ...new Set(
      records
        .map((record) => record.source)
        .filter((source) => !FEED_SOURCES.includes(source)),
    ),
  ];
  const ta3Contributors = [
    ...new Set(
      records.flatMap((record) =>
        record.source === VulnerabilitySource.TA3 && record.user
          ? [record.user.name]
          : [],
      ),
    ),
  ];
  return { sources, ta3Contributors };
}

/** Names one record for a reader: "Vendor advisory GE-2020-004", "TA3 (Seed User)". */
export function recordAttribution(
  record: RecordLike & { sourceId?: string | null },
): string {
  const label = VULNERABILITY_SOURCE_LABELS[record.source];
  const sourceId = record.sourceId ? ` ${record.sourceId}` : "";
  const user = record.user ? ` (${record.user.name})` : "";
  return `${label}${sourceId}${user}`;
}
