import { describe, expect, it } from "vitest";
import { IssueStatus } from "@/generated/prisma";
import { mergeEffectiveIssues } from "../issue-resolution";

const fleet = (id: string, vulnerabilityId: string, status: IssueStatus) => ({
  id,
  vulnerabilityId,
  status,
});

describe("mergeEffectiveIssues", () => {
  it("returns fleet issues unchanged when there are no overrides", () => {
    const result = mergeEffectiveIssues(
      [fleet("f1", "v1", IssueStatus.AFFECTED)],
      [],
    );
    expect(result).toEqual([fleet("f1", "v1", IssueStatus.AFFECTED)]);
  });

  it("lets an asset override replace the fleet issue for the same vulnerability", () => {
    const result = mergeEffectiveIssues(
      [fleet("f1", "v1", IssueStatus.AFFECTED)],
      [fleet("o1", "v1", IssueStatus.NOT_AFFECTED)],
    );
    expect(result).toEqual([fleet("o1", "v1", IssueStatus.NOT_AFFECTED)]);
  });

  it("inherits fleet issues for vulnerabilities the override does not mention", () => {
    const result = mergeEffectiveIssues(
      [
        fleet("f1", "v1", IssueStatus.AFFECTED),
        fleet("f2", "v2", IssueStatus.AFFECTED),
      ],
      [fleet("o1", "v1", IssueStatus.NOT_AFFECTED)],
    );
    expect(result).toContainEqual(fleet("o1", "v1", IssueStatus.NOT_AFFECTED));
    expect(result).toContainEqual(fleet("f2", "v2", IssueStatus.AFFECTED));
    expect(result).toHaveLength(2);
  });

  it("keeps a FIXED override even though the fleet issue is AFFECTED", () => {
    const result = mergeEffectiveIssues(
      [fleet("f1", "v1", IssueStatus.AFFECTED)],
      [fleet("o1", "v1", IssueStatus.FIXED)],
    );
    expect(result).toEqual([fleet("o1", "v1", IssueStatus.FIXED)]);
  });

  it("keeps an override whose vulnerability has no fleet issue", () => {
    const result = mergeEffectiveIssues(
      [],
      [fleet("o1", "v9", IssueStatus.AFFECTED)],
    );
    expect(result).toEqual([fleet("o1", "v9", IssueStatus.AFFECTED)]);
  });

  it("collapses duplicate fleet issues for one vulnerability to the most severe status", () => {
    const result = mergeEffectiveIssues(
      [
        fleet("f1", "v1", IssueStatus.NOT_AFFECTED),
        fleet("f2", "v1", IssueStatus.AFFECTED),
        fleet("f3", "v1", IssueStatus.UNDER_INVESTIGATION),
      ],
      [],
    );
    expect(result).toEqual([fleet("f2", "v1", IssueStatus.AFFECTED)]);
  });

  it("breaks a status tie deterministically by lowest id", () => {
    const result = mergeEffectiveIssues(
      [
        fleet("f2", "v1", IssueStatus.AFFECTED),
        fleet("f1", "v1", IssueStatus.AFFECTED),
      ],
      [],
    );
    expect(result).toEqual([fleet("f1", "v1", IssueStatus.AFFECTED)]);
  });

  it("returns empty for empty inputs", () => {
    expect(mergeEffectiveIssues([], [])).toEqual([]);
  });
});
