import type { Asset, Prisma } from "@/generated/prisma";

const canonicalRefInclude = {
  select: { canonicalName: true, canonicalDisplayName: true },
} as const;

export const advisoryInclude = {
  deviceGroupMatchings: {
    include: {
      vendor: canonicalRefInclude,
      product: canonicalRefInclude,
      version: canonicalRefInclude,
    },
  },
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
