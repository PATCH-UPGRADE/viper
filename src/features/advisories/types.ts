import type { Asset, Prisma } from "@/generated/prisma";

export const advisoryInclude = {
  referencedVulnerabilities: {
    include: {
      issues: {
        include: { asset: true },
      },
    },
  },
} satisfies Prisma.AdvisoryInclude;

export type AdvisoryWithRelations = Prisma.AdvisoryGetPayload<{
  include: typeof advisoryInclude;
}>;

/**
 * Deduplicate assets traversing advisory → referencedVulnerabilities → issues → asset
 */
export function getAffectedAssets(advisory: AdvisoryWithRelations): Asset[] {
  const assetMap = new Map<string, Asset>();
  for (const vuln of advisory.referencedVulnerabilities) {
    for (const issue of vuln.issues) {
      assetMap.set(issue.asset.id, issue.asset);
    }
  }
  return [...assetMap.values()];
}
