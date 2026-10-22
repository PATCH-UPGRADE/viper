import { IssueStatus, type Severity } from "@/generated/prisma";
import type { AffectedIssueCounts } from "../types";

type SeverityIssue = {
  status: IssueStatus;
  vulnerability: { severity: Severity };
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

export function sortFieldKey(field: string): string {
  return field.startsWith("-") ? field.slice(1) : field;
}

export function isAffectedIssueSortKey(key: string): boolean {
  return (AFFECTED_ISSUE_SORT_KEYS as readonly string[]).includes(key);
}

/** Counts the effective issues with status AFFECTED, in total and per severity. */
export function countAffectedIssues(
  issues: SeverityIssue[],
): AffectedIssueCounts {
  const counts = { total: 0, Critical: 0, High: 0, Medium: 0, Low: 0 };
  for (const issue of issues) {
    if (issue.status !== IssueStatus.AFFECTED) continue;
    counts.total++;
    counts[issue.vulnerability.severity]++;
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

/**
 * Sorts rows in memory by comma-separated sort fields ("-" for descending),
 * then by most recently updated.
 */
export function sortByFields<T extends { updatedAt: Date }>(
  rows: T[],
  sortFields: string[],
  sortValue: (row: T, key: string) => number | string,
): T[] {
  const fields = sortFields.map((field) => ({
    key: sortFieldKey(field),
    desc: field.startsWith("-"),
  }));
  const decorated = rows.map((row) => ({
    row,
    values: fields.map(({ key }) => sortValue(row, key)),
  }));

  decorated.sort((a, b) => {
    for (const [i, { desc }] of fields.entries()) {
      const aVal = a.values[i];
      const bVal = b.values[i];

      const cmp =
        typeof aVal === "number" && typeof bVal === "number"
          ? aVal - bVal
          : String(aVal).localeCompare(String(bVal));

      if (cmp !== 0) return desc ? -cmp : cmp;
    }
    return b.row.updatedAt.getTime() - a.row.updatedAt.getTime();
  });
  return decorated.map(({ row }) => row);
}
