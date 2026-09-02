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
 * The effective issues for one asset: an asset-level override wins for its
 * vulnerability; vulnerabilities without an override inherit the fleet-level
 * issue. Duplicate fleet issues for one vulnerability collapse to the most
 * severe status (AFFECTED > UNDER_INVESTIGATION > NOT_AFFECTED > FIXED),
 * ties broken by lowest id.
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
