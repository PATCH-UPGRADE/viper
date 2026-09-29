import { IssueStatus } from "@/generated/prisma";

export const UNKNOWN_ASSET_ROLE_STRING = "Unknown Asset";

export function getAssetRoleLabel(asset: { role: string | null }): string {
  return asset.role ?? UNKNOWN_ASSET_ROLE_STRING;
}

export const assetNameSelect = {
  id: true,
  hostname: true,
  ip: true,
  serialNumber: true,
  role: true,
} as const;

export type AssetNameSource = {
  id: string;
  hostname?: string | null;
  ip?: string | null;
  serialNumber?: string | null;
  role?: string | null;
};

export function getAssetDisplayName(asset: AssetNameSource): string {
  const candidateNames = [
    asset.hostname,
    asset.ip,
    asset.serialNumber,
    asset.role,
  ];
  const firstPresentName = candidateNames.find((name) => name?.trim());
  return firstPresentName ?? asset.id;
}

// One remediation can fix several of the asset's vulnerabilities, so count
// distinct remediations, not a sum of per-vulnerability counts.
export function countAffectedRemediations(
  issues: Array<{
    status: IssueStatus;
    vulnerability: { remediations: Array<{ id: string }> };
  }>,
): number {
  const seen = new Set<string>();
  for (const issue of issues) {
    if (issue.status !== IssueStatus.AFFECTED) continue;
    for (const r of issue.vulnerability.remediations) seen.add(r.id);
  }
  return seen.size;
}
