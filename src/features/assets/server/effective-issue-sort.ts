import { IssueStatus, type Severity } from "@/generated/prisma";
import type { AffectedIssueCounts } from "../types";

type SeverityIssue = {
  status: IssueStatus;
  vulnerability: { severity: Severity | null };
};

/**
 * Sort keys that need each asset's effective issues. No Prisma orderBy can
 * express them, because fleet issues reach an asset through a VERS check that
 * only runs in JavaScript.
 */
export const AFFECTED_ISSUE_SORT_KEYS = [
  "affectedIssues",
  "severity_Critical",
  "severity_High",
  "severity_Medium",
  "severity_Low",
] as const;

export function isAffectedIssueSortKey(key: string): boolean {
  return (AFFECTED_ISSUE_SORT_KEYS as readonly string[]).includes(key);
}

/**
 * Counts the effective issues with status AFFECTED, in total and per severity. An issue on an
 * unrated vulnerability counts toward the total but no severity.
 */
export function countAffectedIssues(
  issues: SeverityIssue[],
): AffectedIssueCounts {
  const counts = { total: 0, Critical: 0, High: 0, Medium: 0, Low: 0 };
  for (const issue of issues) {
    if (issue.status !== IssueStatus.AFFECTED) continue;
    counts.total++;
    const { severity } = issue.vulnerability;
    if (severity) counts[severity]++;
  }
  return counts;
}

export function affectedIssueSortValue(
  counts: AffectedIssueCounts,
  key: string,
): number | undefined {
  if (key === "affectedIssues") return counts.total;
  if (key.startsWith("severity_")) {
    return counts[key.slice("severity_".length) as Severity];
  }
  return undefined;
}
