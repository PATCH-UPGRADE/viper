import { IssueStatus } from "@/generated/prisma";
import type { AffectedAssetsSummary, MatchingWithLabels } from "../types";

// ============================================================================
// Affected-assets triage bucketing
// ============================================================================
//
// Sorts the assets of a device group matching into triage buckets.
// Since we have fewer issues than assets, fetch `Issue` rows, and fetch assets
// later per (matching, bucket) via `getAffectedAssetsPage`

export const AFFECTED_BUCKETS = [
  "needsAttention",
  "needsInformation",
  "lowConcern",
  "unaffected",
] as const;

export type AffectedBucket = (typeof AFFECTED_BUCKETS)[number];

const TRIAGE_BUCKETS = [
  "needsAttention",
  "needsInformation",
  "lowConcern",
] as const;

type TriageBucket = (typeof TRIAGE_BUCKETS)[number];

/**
 * How to select a (matching, bucket)'s asset rows in a paginated query:
 * - `allExcept`: every asset of the matching except the listed overrides.
 * - `only`: just the listed override assets.
 */
export type AssetPageFilter =
  | { kind: "allExcept"; excludedAssetIds: string[] }
  | { kind: "only"; assetIds: string[] };

export type MatchingBucketResult = { count: number; filter: AssetPageFilter };

export type ComputeMatchingBucketsInput = {
  /** vulnerability id to issue status */
  matchingStatusByVuln: Record<string, IssueStatus>;
  /** Asset-level override Issues belonging to this matching. */
  overrides: { assetId: string; statusByVuln: Record<string, IssueStatus> }[];
  /** Total assets the matching resolves to. */
  totalAssetCount: number;
  /** Whether the matching is linked to the notification via NotificationDeviceGroupMapping. */
  isNotificationLinked: boolean;
};

/** The triage buckets a set of effective statuses places an asset into. */
function triageBucketsFor(statuses: Iterable<IssueStatus>): Set<TriageBucket> {
  const set = new Set<IssueStatus>(statuses);
  const out = new Set<TriageBucket>();
  if (set.has(IssueStatus.AFFECTED)) out.add("needsAttention");
  if (set.has(IssueStatus.UNDER_INVESTIGATION)) out.add("needsInformation");
  // Low concern only when NOT_AFFECTED and not also AFFECTED for another vuln.
  if (set.has(IssueStatus.NOT_AFFECTED) && !set.has(IssueStatus.AFFECTED)) {
    out.add("lowConcern");
  }
  return out;
}

/**
 * Compute, for one device group matching, the buckets it appears in — each with
 * its asset count and the filter used to page its rows. Buckets with zero assets
 * are omitted.
 */
export function computeMatchingBuckets(
  input: ComputeMatchingBucketsInput,
): Partial<Record<AffectedBucket, MatchingBucketResult>> {
  const {
    matchingStatusByVuln,
    overrides,
    totalAssetCount,
    isNotificationLinked,
  } = input;
  const defaultStatuses = Object.values(matchingStatusByVuln);
  const hasAnyIssue = defaultStatuses.length > 0 || overrides.length > 0;

  // No issues at all: a notification-linked matching renders as a plain card;
  // an issue-referenced-only matching with no issues here contributes nothing.
  if (!hasAnyIssue) {
    if (isNotificationLinked && totalAssetCount > 0) {
      return {
        unaffected: {
          count: totalAssetCount,
          filter: { kind: "allExcept", excludedAssetIds: [] },
        },
      };
    }
    return {};
  }

  const defaultBuckets = triageBucketsFor(defaultStatuses);

  // Each override asset's effective status set = override merged over the
  // matching defaults, so a partial override still inherits the other vulns.
  const overrideBuckets = overrides.map((o) => ({
    assetId: o.assetId,
    buckets: triageBucketsFor(
      Object.values({ ...matchingStatusByVuln, ...o.statusByVuln }),
    ),
  }));

  const result: Partial<Record<AffectedBucket, MatchingBucketResult>> = {};
  for (const bucket of TRIAGE_BUCKETS) {
    if (defaultBuckets.has(bucket)) {
      // Every non-override asset is in this bucket; drop overrides that aren't.
      const excludedAssetIds = overrideBuckets
        .filter((o) => !o.buckets.has(bucket))
        .map((o) => o.assetId);
      const count = totalAssetCount - excludedAssetIds.length;
      if (count > 0) {
        result[bucket] = {
          count,
          filter: { kind: "allExcept", excludedAssetIds },
        };
      }
    } else {
      // Only override assets that individually land in this bucket.
      const assetIds = overrideBuckets
        .filter((o) => o.buckets.has(bucket))
        .map((o) => o.assetId);
      if (assetIds.length > 0) {
        result[bucket] = {
          count: assetIds.length,
          filter: { kind: "only", assetIds },
        };
      }
    }
  }
  return result;
}

export type MatchingBucketGroup = {
  mappingId: string | null;
  deviceGroupMatching: MatchingWithLabels;
  buckets: Partial<Record<AffectedBucket, MatchingBucketResult>>;
};

/**
 * Flatten per-matching bucket results into the four summary arrays consumed by
 * the affected-assets tab. Counts only — no asset rows.
 */
export function buildAffectedAssetsSummary(
  groups: MatchingBucketGroup[],
): AffectedAssetsSummary {
  const summary: AffectedAssetsSummary = {
    needsAttention: [],
    needsInformation: [],
    lowConcern: [],
    unaffected: [],
  };
  for (const group of groups) {
    for (const bucket of AFFECTED_BUCKETS) {
      const res = group.buckets[bucket];
      if (res && res.count > 0) {
        summary[bucket].push({
          mappingId: group.mappingId,
          deviceGroupMatching: group.deviceGroupMatching,
          assetCount: res.count,
        });
      }
    }
  }
  return summary;
}
