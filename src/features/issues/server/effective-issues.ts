import "server-only";
import type { Prisma } from "@/generated/prisma";
import prisma, { type ExtendedPrismaClient } from "@/lib/db";
import {
  type DeviceIdentity,
  deviceKey,
  matchingAppliesToDevice,
  matchingWhereForDevice,
} from "@/lib/device-matching";
import {
  type MergeableIssue,
  mergeEffectiveIssues,
} from "@/lib/issue-resolution";

const matchingIdentitySelect = {
  id: true,
  manufacturerId: true,
  productId: true,
  versionId: true,
  versionRange: true,
} as const;

type IssueRows<I extends Prisma.IssueInclude> = Prisma.Result<
  ExtendedPrismaClient["issue"],
  { include: I },
  "findMany"
>;

type IssueRow<I extends Prisma.IssueInclude> = IssueRows<I>[number] &
  MergeableIssue & {
    assetId: string | null;
    deviceGroupMatchingId: string | null;
  };

export async function resolveEffectiveIssuesByAsset<
  I extends Prisma.IssueInclude,
>(assets: DeviceIdentity[], include: I): Promise<Map<string, IssueRows<I>>> {
  const effectiveIssuesByAssetId = new Map<string, IssueRows<I>>();
  if (assets.length === 0) return effectiveIssuesByAssetId;

  const assetIds = [...new Set(assets.map((a) => a.id))];

  // Many assets share one device, so each distinct device is matched once.
  // DeviceGroupMatching requires a manufacturer, so devices without one match nothing.
  const devices = new Map<
    string,
    DeviceIdentity & { manufacturerId: string }
  >();
  for (const asset of assets) {
    if (asset.manufacturerId !== null) {
      devices.set(deviceKey(asset), {
        ...asset,
        manufacturerId: asset.manufacturerId,
      });
    }
  }

  const candidateMatchings =
    devices.size === 0
      ? []
      : await prisma.deviceGroupMatching.findMany({
          where: {
            OR: [...devices.values()].map((d) =>
              matchingWhereForDevice({
                manufacturerId: d.manufacturerId,
                productId: d.productId,
              }),
            ),
          },
          select: matchingIdentitySelect,
        });

  // combine each device and DeviceGroupMatching using manufacturerId, productId, and versions range
  const matchingIdsByDevice = new Map<string, string[]>();
  for (const [key, device] of devices) {
    matchingIdsByDevice.set(
      key,
      candidateMatchings
        .filter((matching) => matchingAppliesToDevice(matching, device))
        .map((matching) => matching.id),
    );
  }

  // 1 unique array of DGM ids related to these assets
  const allMatchingIds = [...new Set([...matchingIdsByDevice.values()].flat())];

  const issues = (await prisma.issue.findMany({
    where: {
      OR: [
        { deviceGroupMatchingId: { in: allMatchingIds } },
        { assetId: { in: assetIds } },
      ],
    },
    include: include as never,
  })) as IssueRow<I>[];

  const fleetIssuesByMatchingId = new Map<string, typeof issues>();
  const overrideIssuesByAssetId = new Map<string, typeof issues>();
  for (const issue of issues) {
    if (issue.assetId !== null) {
      const overrides = overrideIssuesByAssetId.get(issue.assetId) ?? [];
      overrides.push(issue);
      overrideIssuesByAssetId.set(issue.assetId, overrides);
    } else if (issue.deviceGroupMatchingId !== null) {
      const fleetIssues =
        fleetIssuesByMatchingId.get(issue.deviceGroupMatchingId) ?? [];
      fleetIssues.push(issue);
      fleetIssuesByMatchingId.set(issue.deviceGroupMatchingId, fleetIssues);
    }
  }

  for (const asset of assets) {
    const applicableMatchingIds =
      matchingIdsByDevice.get(deviceKey(asset)) ?? [];
    const fleetIssues = applicableMatchingIds.flatMap(
      (matchingId) => fleetIssuesByMatchingId.get(matchingId) ?? [],
    );
    const overrideIssues = overrideIssuesByAssetId.get(asset.id) ?? [];
    effectiveIssuesByAssetId.set(
      asset.id,
      mergeEffectiveIssues(fleetIssues, overrideIssues),
    );
  }

  return effectiveIssuesByAssetId;
}
