import { describe, expect, it } from "vitest";
import { planVexWrites, type VexContext, type VexResult } from "../vex";

// A notification linking one vuln whose matching resolves to a device group with
// two assets, plus a second vuln/issue with no assets.
const context: VexContext = {
  notificationId: "notif_1",
  markdown: "",
  issues: [
    {
      issueId: "issue_group_a",
      vulnerabilityId: "vuln_a",
      assetIds: ["asset_reachable", "asset_unreachable"],
    },
    {
      issueId: "issue_group_b",
      vulnerabilityId: "vuln_b",
      assetIds: [],
    },
  ],
};

describe("planVexWrites", () => {
  it("marks an issue NOT_AFFECTED with a justification when a feature is absent", () => {
    const result: VexResult = {
      issue_group_a: {
        status: {
          status: "NOT_AFFECTED",
          justification: "COMPONENT_NOT_PRESENT",
        },
        reasonWhy: "Note says the affected feature is not enabled.",
        confidence: "Matched",
      },
    };

    const { issueUpdates, assetOverrides } = planVexWrites(context, result);
    expect(assetOverrides).toEqual([]);
    expect(issueUpdates).toEqual([
      {
        issueId: "issue_group_a",
        status: "NOT_AFFECTED",
        justification: "COMPONENT_NOT_PRESENT",
        confidence: "Matched",
        notes: "Note says the affected feature is not enabled.",
      },
    ]);
  });

  it("creates an asset override and leaves the group issue untouched when only one asset differs", () => {
    const result: VexResult = {
      issue_group_a: {
        // no group status => group issue unchanged
        assets: [
          {
            id: "asset_unreachable",
            status: {
              status: "NOT_AFFECTED",
              justification: "HOSPITAL_COMPENSATING_CONTROL",
            },
            reasonWhy: "Asset is not reachable over the network.",
          },
        ],
      },
    };

    const { issueUpdates, assetOverrides } = planVexWrites(context, result);
    expect(issueUpdates).toEqual([]);
    expect(assetOverrides).toEqual([
      {
        assetId: "asset_unreachable",
        vulnerabilityId: "vuln_a",
        status: "NOT_AFFECTED",
        justification: "HOSPITAL_COMPENSATING_CONTROL",
        confidence: "NeedsReview", // defaulted when no group confidence supplied
        notes: "Asset is not reachable over the network.",
      },
    ]);
  });

  it("marks an issue UNDER_INVESTIGATION when device detail is insufficient", () => {
    const result: VexResult = {
      issue_group_b: {
        status: { status: "UNDER_INVESTIGATION" },
        reasonWhy: "Not enough detail about the device firmware.",
        confidence: "NeedsReview",
      },
    };

    const { issueUpdates } = planVexWrites(context, result);
    expect(issueUpdates).toEqual([
      {
        issueId: "issue_group_b",
        status: "UNDER_INVESTIGATION",
        justification: null,
        confidence: "NeedsReview",
        notes: "Not enough detail about the device firmware.",
      },
    ]);
  });

  it("supports a group update and an asset override together", () => {
    const result: VexResult = {
      issue_group_a: {
        status: {
          status: "NOT_AFFECTED",
          justification: "VULNERABLE_CODE_CANNOT_BE_CONTROLLED_BY_ADVERSARY",
        },
        reasonWhy: "Exploit path unreachable on this device class.",
        confidence: "Matched",
        assets: [
          {
            id: "asset_reachable",
            status: { status: "UNDER_INVESTIGATION" },
            reasonWhy: "This one asset has an unusual config.",
          },
        ],
      },
    };

    const { issueUpdates, assetOverrides } = planVexWrites(context, result);
    expect(issueUpdates).toHaveLength(1);
    expect(assetOverrides).toEqual([
      {
        assetId: "asset_reachable",
        vulnerabilityId: "vuln_a",
        status: "UNDER_INVESTIGATION",
        justification: null,
        confidence: "Matched",
        notes: "This one asset has an unusual config.",
      },
    ]);
  });

  it("skips hallucinated issue ids not present in context", () => {
    const result: VexResult = {
      not_a_real_issue: {
        status: { status: "AFFECTED" },
        reasonWhy: "x",
        confidence: "Matched",
      },
    };
    expect(planVexWrites(context, result)).toEqual({
      issueUpdates: [],
      assetOverrides: [],
    });
  });

  it("skips NOT_AFFECTED without a justification", () => {
    const result = {
      issue_group_a: {
        // deliberately missing justification (bypasses the zod guard)
        status: { status: "NOT_AFFECTED" },
        reasonWhy: "x",
        confidence: "Matched",
      },
    } as unknown as VexResult;
    expect(planVexWrites(context, result).issueUpdates).toEqual([]);
  });

  it("skips asset overrides for assets not reachable through the issue", () => {
    const result: VexResult = {
      issue_group_a: {
        assets: [
          {
            id: "asset_from_another_group",
            status: {
              status: "NOT_AFFECTED",
              justification: "HOSPITAL_COMPENSATING_CONTROL",
            },
            reasonWhy: "x",
          },
        ],
      },
    };
    expect(planVexWrites(context, result).assetOverrides).toEqual([]);
  });

  it("treats an empty object value as no change", () => {
    const result: VexResult = { issue_group_a: {}, issue_group_b: {} };
    expect(planVexWrites(context, result)).toEqual({
      issueUpdates: [],
      assetOverrides: [],
    });
  });
});
