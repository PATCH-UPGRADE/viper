import type { SourceBlock } from "@/components/sources";
import {
  type Metric,
  MetricType,
  Severity,
  VulnerabilitySource,
} from "@/generated/prisma";
import { type MetricResponse, toMetricResponse } from "./types";

export const CVE_PATTERN = /^CVE-\d{4}-\d{4,}$/i;

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
    INBOX: "Inbox",
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
 * TODO: VW-585 replace "newest CVSS wins" once there's a precedence rule between sources.
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

interface NamedRecordLike extends RecordLike {
  sourceId?: string | null;
  externalMapping?: { integration: { name: string } } | null;
}

/**
 * How a record is named wherever it is listed: the integration it came through when it has an
 * external mapping, otherwise the user who sent it (for a TA3 submission, the TA3 performer),
 * otherwise its source.
 */
export function recordSourceName(record: NamedRecordLike): string {
  if (record.externalMapping) return record.externalMapping.integration.name;
  if (record.user) return record.user.name;
  return VULNERABILITY_SOURCE_LABELS[record.source];
}

/**
 * The record's kind and the ID its source gives it ("Vendor advisory GE-2020-004"), or null when
 * recordSourceName already says it. A feed's sourceId is the CVE itself, so it is left off.
 */
export function recordTypeText(record: NamedRecordLike): string | null {
  const sourceId =
    record.sourceId && !FEED_SOURCES.includes(record.source)
      ? ` ${record.sourceId}`
      : "";
  const text = `${VULNERABILITY_SOURCE_LABELS[record.source]}${sourceId}`;
  return text === recordSourceName(record) ? null : text;
}

/** What kind of source a record is, as a source block's tooltip shows it. */
export const VULNERABILITY_SOURCE_TYPE_LABELS: Record<
  VulnerabilitySource,
  string
> = {
  TA3: "TA3",
  VENDOR_ADVISORY: "Advisory",
  AI: "Automation",
  OTHER: "API",
  INBOX: "Inbox",
  FIRST_EPSS: "Feed",
  CISA_KEV: "Feed",
};

/**
 * One dashboard block per record, named by recordSourceName. The EPSS and KEV feeds are on nearly
 * every vulnerability, so they are left out.
 */
export function recordSourceBlocks(
  records: (NamedRecordLike & { id: string })[],
): SourceBlock[] {
  return records
    .filter((record) => !FEED_SOURCES.includes(record.source))
    .map((record) => ({
      key: record.id,
      name: recordSourceName(record),
      kind: record.externalMapping
        ? "integration"
        : record.user
          ? "person"
          : record.source === VulnerabilitySource.AI
            ? "automation"
            : "integration",
      typeLabel: VULNERABILITY_SOURCE_TYPE_LABELS[record.source],
    }));
}
