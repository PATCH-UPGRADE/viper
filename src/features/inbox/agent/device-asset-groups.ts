import "server-only";
import { deviceTypeLabelSelect } from "@/features/assets/utils";
import type { Prisma } from "@/generated/prisma";
import prisma from "@/lib/db";
import {
  deviceIdentitySelect,
  deviceKey,
  type MatchingLike,
  matchingAppliesToDevice,
  strictAssetWhereForMatching,
} from "@/lib/device-matching";

const groupedAssetSelect = {
  ...deviceIdentitySelect,
  hostname: true,
  ip: true,
  role: true,
  location: true,
  utilization: true,
  manufacturer: { select: { canonicalDisplayName: true } },
  product: {
    select: { canonicalDisplayName: true, ...deviceTypeLabelSelect },
  },
  version: { select: { canonicalName: true, canonicalDisplayName: true } },
} as const satisfies Prisma.AssetSelect;

type GroupedAsset = Prisma.AssetGetPayload<{
  select: typeof groupedAssetSelect;
}>;

/**
 * The owned assets that share one manufacturer, product, and version. The
 * agent prompts describe an advisory's reach one group at a time.
 */
export type DeviceAssetGroup = Pick<
  GroupedAsset,
  | "manufacturerId"
  | "productId"
  | "versionId"
  | "manufacturer"
  | "product"
  | "version"
> & {
  id: string;
  /** The ids of the matchings that apply to this group. */
  matchingIds: string[];
  assets: Pick<
    GroupedAsset,
    "id" | "hostname" | "ip" | "role" | "location" | "utilization"
  >[];
};

/** The owned assets that any of the matchings applies to, grouped by device. */
export async function deviceAssetGroupsForMatchings(
  matchings: (MatchingLike & { id: string })[],
): Promise<DeviceAssetGroup[]> {
  if (matchings.length === 0) return [];
  const candidates = await prisma.asset.findMany({
    where: { OR: matchings.map(strictAssetWhereForMatching) },
    select: groupedAssetSelect,
  });

  const groups = new Map<string, DeviceAssetGroup>();
  const unmatched = new Set<string>();
  for (const asset of candidates) {
    const id = deviceKey(asset);
    if (unmatched.has(id)) continue;
    let group = groups.get(id);
    if (!group) {
      // Every asset in a group has the same device, so one check covers them all.
      const matchingIds = matchings
        .filter((m) => matchingAppliesToDevice(m, asset))
        .map((m) => m.id);
      if (matchingIds.length === 0) {
        unmatched.add(id);
        continue;
      }
      group = {
        id,
        matchingIds,
        manufacturerId: asset.manufacturerId,
        productId: asset.productId,
        versionId: asset.versionId,
        manufacturer: asset.manufacturer,
        product: asset.product,
        version: asset.version,
        assets: [],
      };
      groups.set(id, group);
    }
    group.assets.push({
      id: asset.id,
      hostname: asset.hostname,
      ip: asset.ip,
      role: asset.role,
      location: asset.location,
      utilization: asset.utilization,
    });
  }
  return [...groups.values()];
}
