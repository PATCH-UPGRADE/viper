// @vitest-environment node
import { describe, expect, it } from "vitest";
import { IssueStatus, Severity } from "@/generated/prisma";
import {
  affectedIssueSortValue,
  countAffectedIssues,
} from "../effective-issue-sort";

const issue = (status: IssueStatus, severity: Severity) => ({
  status,
  vulnerability: { severity },
});

describe("countAffectedIssues", () => {
  it("counts only AFFECTED issues, in total and per severity", () => {
    expect(
      countAffectedIssues([
        issue(IssueStatus.AFFECTED, Severity.Critical),
        issue(IssueStatus.AFFECTED, Severity.Low),
        issue(IssueStatus.FIXED, Severity.Critical),
        issue(IssueStatus.NOT_AFFECTED, Severity.High),
        issue(IssueStatus.UNDER_INVESTIGATION, Severity.Medium),
      ]),
    ).toEqual({ total: 2, Critical: 1, High: 0, Medium: 0, Low: 1 });
  });
});

describe("affectedIssueSortValue", () => {
  const counts = { total: 4, Critical: 1, High: 3, Medium: 0, Low: 0 };

  it("reads the total and each severity", () => {
    expect(affectedIssueSortValue(counts, "affectedIssues")).toBe(4);
    expect(affectedIssueSortValue(counts, "severity_High")).toBe(3);
  });

  it("returns undefined for a key that is not an issue count", () => {
    expect(affectedIssueSortValue(counts, "hostname")).toBeUndefined();
  });
});
