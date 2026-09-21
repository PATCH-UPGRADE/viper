import "server-only";
import type { Prisma } from "@/generated/prisma";
import prisma, { type ExtendedPrismaClient } from "@/lib/db";
import {
  matchingAppliesToDeviceGroup,
  matchingWhereForDeviceGroup,
} from "@/lib/device-matching";
import {
  type MergeableIssue,
  mergeEffectiveIssues,
} from "@/lib/issue-resolution";

const groupIdentitySelect = {
  id: true,
  manufacturerId: true,
  productId: true,
  versionId: true,
  version: { select: { canonicalName: true } },
} as const;

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
>(
  assets: { id: string; deviceGroupId: string }[],
  include: I,
): Promise<Map<string, IssueRows<I>>> {
  const effectiveIssuesByAssetId = new Map<string, IssueRows<I>>();
  if (assets.length === 0) return effectiveIssuesByAssetId;

  const deviceGroupIds = [...new Set(assets.map((a) => a.deviceGroupId))];
  const deviceGroups = await prisma.deviceGroup.findMany({
    where: { id: { in: deviceGroupIds } },
    select: groupIdentitySelect,
  });

  // DeviceGroupMatching entity requires manufacture.id, so we can filter out which one has DGM
  const groupsWithManufacturer = deviceGroups.filter(
    (g): g is (typeof deviceGroups)[number] & { manufacturerId: string } =>
      g.manufacturerId !== null,
  );

  const candidateMatchings =
    groupsWithManufacturer.length === 0
      ? []
      : await prisma.deviceGroupMatching.findMany({
          where: {
            OR: groupsWithManufacturer.map((g) =>
              matchingWhereForDeviceGroup({
                manufacturerId: g.manufacturerId,
                productId: g.productId,
              }),
            ),
          },
          select: matchingIdentitySelect,
        });

  const matchingIdsByGroupId = new Map<string, string[]>();

  // combine DeviceGroup and DeviceGroupMatching using manufacturerId, productId, and versions range
  for (const group of groupsWithManufacturer) {
    const applicableMatchingIds = candidateMatchings
      .filter((matching) => matchingAppliesToDeviceGroup(matching, group))
      .map((matching) => matching.id);
    matchingIdsByGroupId.set(group.id, applicableMatchingIds);
  }

  // 1 unique array of DGM ids related to found DeviceGroups
  const allMatchingIds = [
    ...new Set([...matchingIdsByGroupId.values()].flat()),
  ];
  const assetIds = assets.map((a) => a.id);

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
      matchingIdsByGroupId.get(asset.deviceGroupId) ?? [];
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
