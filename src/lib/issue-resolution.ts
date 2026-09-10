import { IssueStatus } from "@/generated/prisma";

const STATUS_PRECEDENCE: IssueStatus[] = [
  IssueStatus.AFFECTED,
  IssueStatus.UNDER_INVESTIGATION,
  IssueStatus.NOT_AFFECTED,
  IssueStatus.FIXED,
];

export type MergeableIssue = {
  id: string;
  vulnerabilityId: string;
  status: IssueStatus;
};

function takesPrecedence(
  candidate: MergeableIssue,
  current: MergeableIssue,
): boolean {
  const candidateRank = STATUS_PRECEDENCE.indexOf(candidate.status);
  const currentRank = STATUS_PRECEDENCE.indexOf(current.status);
  if (candidateRank !== currentRank) return candidateRank < currentRank;
  return candidate.id < current.id;
}

/**
 * Merge multiple issues under 1 asset.
 * Pick Individual Issue over Fleet's Issue
 * If no Individual Issue go to Fleet's Issue
 * If there are multiple Fleet's Issues, picks the most severe one
 */

export function mergeEffectiveIssues<T extends MergeableIssue>(
  fleetIssues: T[],
  overrideIssues: T[],
): T[] {
  const overriddenVulnerabilityIds = new Set(
    overrideIssues.map((issue) => issue.vulnerabilityId),
  );

  const fleetIssueByVulnerability = new Map<string, T>();
  for (const issue of fleetIssues) {
    if (overriddenVulnerabilityIds.has(issue.vulnerabilityId)) continue;
    const current = fleetIssueByVulnerability.get(issue.vulnerabilityId);
    if (!current || takesPrecedence(issue, current)) {
      fleetIssueByVulnerability.set(issue.vulnerabilityId, issue);
    }
  }

  return [...overrideIssues, ...fleetIssueByVulnerability.values()];
}
