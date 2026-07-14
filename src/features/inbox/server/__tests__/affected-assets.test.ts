import { describe, expect, it } from "vitest";
import { IssueStatus } from "@/generated/prisma";
import type { MatchingWithLabels } from "../../types";
import {
  buildAffectedAssetsSummary,
  computeMatchingBuckets,
} from "../affected-assets";

const { AFFECTED, NOT_AFFECTED, UNDER_INVESTIGATION } = IssueStatus;

// Minimal stand-in for the vendor/product/version labels; only identity matters.
const labels = (id: string) => ({ id }) as unknown as MatchingWithLabels;

describe("computeMatchingBuckets", () => {
  it("DG1 — matching-level AFFECTED for both vulns → Needs Attention only", () => {
    // Vuln1/DG1 AFFECTED, Vuln2/DG1 AFFECTED; one asset (1.1), no overrides.
    const res = computeMatchingBuckets({
      matchingStatusByVuln: { v1: AFFECTED, v2: AFFECTED },
      overrides: [],
      totalAssetCount: 1,
      isNotificationLinked: true,
    });
    expect(res).toEqual({
      needsAttention: {
        count: 1,
        filter: { kind: "allExcept", excludedAssetIds: [] },
      },
    });
  });

  it("DG2 — NOT_AFFECTED + AFFECTED suppresses Low Concern", () => {
    // Vuln1/DG2 NOT_AFFECTED, Vuln2/DG2 AFFECTED; assets 2.1, 2.2; no overrides.
    const res = computeMatchingBuckets({
      matchingStatusByVuln: { v1: NOT_AFFECTED, v2: AFFECTED },
      overrides: [],
      totalAssetCount: 2,
      isNotificationLinked: true,
    });
    expect(res.needsAttention).toEqual({
      count: 2,
      filter: { kind: "allExcept", excludedAssetIds: [] },
    });
    expect(res.lowConcern).toBeUndefined();
    expect(res.needsInformation).toBeUndefined();
  });

  it("DG3 — asset-level override splits buckets", () => {
    // Vuln1/DG3 AFFECTED, Vuln2/DG3 UNDER_INVESTIGATION; assets 3.1, 3.2, 3.3.
    // Asset 3.1 has an override Issue: Vuln1 NOT_AFFECTED.
    const res = computeMatchingBuckets({
      matchingStatusByVuln: { v1: AFFECTED, v2: UNDER_INVESTIGATION },
      overrides: [{ assetId: "3.1", statusByVuln: { v1: NOT_AFFECTED } }],
      totalAssetCount: 3,
      isNotificationLinked: true,
    });
    // Needs Attention: 3.2, 3.3 (3.1 excluded).
    expect(res.needsAttention).toEqual({
      count: 2,
      filter: { kind: "allExcept", excludedAssetIds: ["3.1"] },
    });
    // Needs Information: all three (3.1 still UNDER_INVESTIGATION via vuln2).
    expect(res.needsInformation).toEqual({
      count: 3,
      filter: { kind: "allExcept", excludedAssetIds: [] },
    });
    // Low Concern: only 3.1 (NOT_AFFECTED and not AFFECTED for it).
    expect(res.lowConcern).toEqual({
      count: 1,
      filter: { kind: "only", assetIds: ["3.1"] },
    });
  });

  it("notification-linked matching with no issues → Unaffected", () => {
    const res = computeMatchingBuckets({
      matchingStatusByVuln: {},
      overrides: [],
      totalAssetCount: 5,
      isNotificationLinked: true,
    });
    expect(res).toEqual({
      unaffected: {
        count: 5,
        filter: { kind: "allExcept", excludedAssetIds: [] },
      },
    });
  });

  it("issue-only matching with no issues here contributes nothing", () => {
    const res = computeMatchingBuckets({
      matchingStatusByVuln: {},
      overrides: [],
      totalAssetCount: 5,
      isNotificationLinked: false,
    });
    expect(res).toEqual({});
  });

  it("omits buckets that resolve to zero assets", () => {
    // Matching-level AFFECTED but the matching resolves to no inventory.
    const res = computeMatchingBuckets({
      matchingStatusByVuln: { v1: AFFECTED },
      overrides: [],
      totalAssetCount: 0,
      isNotificationLinked: true,
    });
    expect(res).toEqual({});
  });
});

describe("buildAffectedAssetsSummary", () => {
  it("reproduces the DG1/DG2/DG3 example layout", () => {
    const dg1 = labels("DG1");
    const dg2 = labels("DG2");
    const dg3 = labels("DG3");

    const summary = buildAffectedAssetsSummary([
      {
        mappingId: "m1",
        deviceGroupMatching: dg1,
        buckets: computeMatchingBuckets({
          matchingStatusByVuln: { v1: AFFECTED, v2: AFFECTED },
          overrides: [],
          totalAssetCount: 1,
          isNotificationLinked: true,
        }),
      },
      {
        mappingId: "m2",
        deviceGroupMatching: dg2,
        buckets: computeMatchingBuckets({
          matchingStatusByVuln: { v1: NOT_AFFECTED, v2: AFFECTED },
          overrides: [],
          totalAssetCount: 2,
          isNotificationLinked: true,
        }),
      },
      {
        mappingId: "m3",
        deviceGroupMatching: dg3,
        buckets: computeMatchingBuckets({
          matchingStatusByVuln: { v1: AFFECTED, v2: UNDER_INVESTIGATION },
          overrides: [{ assetId: "3.1", statusByVuln: { v1: NOT_AFFECTED } }],
          totalAssetCount: 3,
          isNotificationLinked: true,
        }),
      },
    ]);

    expect(summary.needsAttention).toEqual([
      { mappingId: "m1", deviceGroupMatching: dg1, assetCount: 1 },
      { mappingId: "m2", deviceGroupMatching: dg2, assetCount: 2 },
      { mappingId: "m3", deviceGroupMatching: dg3, assetCount: 2 },
    ]);
    expect(summary.needsInformation).toEqual([
      { mappingId: "m3", deviceGroupMatching: dg3, assetCount: 3 },
    ]);
    expect(summary.lowConcern).toEqual([
      { mappingId: "m3", deviceGroupMatching: dg3, assetCount: 1 },
    ]);
    expect(summary.unaffected).toEqual([]);
  });
});
