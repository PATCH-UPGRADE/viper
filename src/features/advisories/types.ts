import type { Asset, Prisma } from "@/generated/prisma";

export const advisoryInclude = {
  referencedVulnerabilities: {
    include: {
      affectedDeviceGroups: {
        include: { assets: true },
      },
    },
  },
} satisfies Prisma.AdvisoryInclude;

export type AdvisoryWithRelations = Prisma.AdvisoryGetPayload<{
  include: typeof advisoryInclude;
}>;

/**
 * Deduplicate assets traversing advisory → referencedVulnerabilities → affectedDeviceGroups → assets
 */
export function getAffectedAssets(advisory: AdvisoryWithRelations): Asset[] {
  const assetMap = new Map<string, Asset>();
  for (const vuln of advisory.referencedVulnerabilities) {
    for (const dg of vuln.affectedDeviceGroups) {
      for (const asset of dg.assets) {
        assetMap.set(asset.id, asset);
      }
    }
  }
  return [...assetMap.values()];
}
