import { z } from "zod";
import {
  assetNameSearchTerms,
  countAffectedRemediations,
  type DeviceTypeSource,
  getAssetDeviceTypeLabel,
} from "@/features/assets/utils";
import { prepareDeviceTypeSlugs } from "@/features/device-types/server/apply-device-type";
import { resolveEffectiveIssuesByAsset } from "@/features/issues/server/effective-issues";
import {
  attachNote,
  attachNotes,
} from "@/features/notes/server/get-relevant-notes";
import {
  IssueStatus,
  type Prisma,
  ResourceType,
  Severity,
} from "@/generated/prisma";
import prisma from "@/lib/db";
import {
  type DeviceIdentity,
  deviceIdentitySelect,
} from "@/lib/device-matching";
import { renderUtilization } from "@/lib/markdown";
import {
  buildPaginationMeta,
  createPaginatedResponse,
  type PaginationInput,
  paginationInputSchema,
} from "@/lib/pagination";
import {
  assetWhereForMatchings,
  buildUpdatedAtFilter,
  deviceInputToAsset,
  fetchPaginated,
  findVulnerabilitiesMatchingDevices,
  processIntegrationToken,
} from "@/lib/router-utils";
import { integrationResponseSchema } from "@/lib/schemas";
import {
  baseProcedure,
  createTRPCRouter,
  protectedProcedure,
} from "@/trpc/init";
import { requireExistence, requireOwnership } from "@/trpc/middleware";
import {
  assetArrayInputSchema,
  assetArrayResponseSchema,
  assetDashboardInclude,
  assetInclude,
  assetInputSchema,
  assetResponseSchema,
  assetsVulnsInputSchema,
  integrationAssetInputSchema,
  paginatedAssetResponseSchema,
  updateAssetSchema,
} from "../types";
import {
  AFFECTED_ISSUE_SORT_KEYS,
  affectedIssueSortValue,
  countAffectedIssues,
  isAffectedIssueSortKey,
  sortByFields,
  sortFieldKey,
} from "./effective-issue-sort";
import { processAssetIntegrationSync } from "./integration-sync";
import { fetchUtilizationGrids } from "./utilization";

const createSearchFilter = (search: string) => {
  const insensitive = { contains: search, mode: "insensitive" as const };
  return search
    ? {
        OR: [
          ...assetNameSearchTerms(insensitive),
          { manufacturer: { is: { canonicalName: insensitive } } },
          { product: { is: { canonicalName: insensitive } } },
        ],
      }
    : {};
};

/**
 * The orderBy for a table sort: comma-separated column ids, each with a "-"
 * in front for descending. Two ids need their own shape: "issues" sorts by
 * the issue count, and "deviceType" by the product's device type, which is not
 * a field of Asset.
 */
export function assetOrderBy(
  sort: string | undefined,
): Prisma.AssetOrderByWithRelationInput[] {
  const fields = sort ? sort.split(",").filter(Boolean) : [];
  return [
    ...fields.map((field): Prisma.AssetOrderByWithRelationInput => {
      const direction = field.startsWith("-") ? "desc" : "asc";
      const key = field.replace("-", "");
      if (key === "issues") return { issues: { _count: direction } };
      if (key === "deviceType") {
        return { product: { deviceType: { displayName: direction } } };
      }
      return { [key]: direction };
    }),
    { updatedAt: "desc" },
    { id: "asc" },
  ];
}

/** The sort keys that assets.getMany accepts; it drops any other key. */
export const ASSET_SORT_KEYS = new Set<string>([
  "ip",
  "hostname",
  "role",
  "networkSegment",
  "serialNumber",
  "macAddress",
  "status",
  "createdAt",
  "updatedAt",
  "deviceType",
  ...AFFECTED_ISSUE_SORT_KEYS,
]);

const affectedIssueCountInclude = {
  vulnerability: { select: { severity: true } },
} satisfies Prisma.IssueInclude;

async function withAffectedIssueCounts<T extends DeviceIdentity>(assets: T[]) {
  const effectiveIssues = await resolveEffectiveIssuesByAsset(
    assets,
    affectedIssueCountInclude,
  );
  return assets.map((asset) => ({
    ...asset,
    affectedIssueCounts: countAffectedIssues(
      effectiveIssues.get(asset.id) ?? [],
    ),
  }));
}

async function fetchAssetsWithAffectedIssueCounts(
  where: Prisma.AssetWhereInput,
  input: PaginationInput,
  sortFields: string[],
) {
  const result = await fetchPaginated(prisma.asset, input, {
    where,
    include: assetInclude,
    ...(sortFields.length > 0 && {
      orderBy: assetOrderBy(sortFields.join(",")),
    }),
  });
  return { ...result, items: await withAffectedIssueCounts(result.items) };
}

/** The in-memory sort value of an Asset column, for `sortByFields`. */
function assetColumnSortValue(
  asset: DeviceTypeSource,
  key: string,
): number | string {
  if (key === "deviceType") return getAssetDeviceTypeLabel(asset) ?? "";
  const val = (asset as Record<string, unknown>)[key];
  if (val instanceof Date) return val.getTime();
  return String(val ?? "");
}

// Loads every matching asset and sorts in memory, as getManyDashboardInternal
// does: effective issues are resolved in JavaScript, so SQL cannot order by them.
async function fetchAssetsSortedByAffectedIssues(
  where: Prisma.AssetWhereInput,
  input: PaginationInput,
  sortFields: string[],
) {
  const assets = await prisma.asset.findMany({
    where: { ...where, ...buildUpdatedAtFilter(input) },
    include: assetInclude,
  });
  const meta = buildPaginationMeta(input, assets.length);
  const rows = await withAffectedIssueCounts(assets);

  const sorted = sortByFields(
    rows,
    sortFields,
    (asset, key) =>
      affectedIssueSortValue(asset.affectedIssueCounts, key) ??
      assetColumnSortValue(asset, key),
  );

  return createPaginatedResponse(
    sorted.slice(meta.skip, meta.skip + meta.take),
    meta,
  );
}

export const assetsRouter = createTRPCRouter({
  // GET /api/assets - List all assets (any authenticated user can see all)
  getMany: protectedProcedure
    .input(paginationInputSchema)
    .meta({
      openapi: {
        method: "GET",
        path: "/assets",
        tags: ["Assets"],
        summary: "List Assets",
        description:
          "Get all assets. Any authenticated user can view all assets.",
      },
    })
    .output(paginatedAssetResponseSchema)
    .query(async ({ input }) => {
      const { search, sort } = input;

      const where = createSearchFilter(search);
      const sortFields = (sort ? sort.split(",") : []).filter((field) =>
        ASSET_SORT_KEYS.has(sortFieldKey(field)),
      );

      const result = sortFields.some((field) =>
        isAffectedIssueSortKey(sortFieldKey(field)),
      )
        ? await fetchAssetsSortedByAffectedIssues(where, input, sortFields)
        : await fetchAssetsWithAffectedIssueCounts(where, input, sortFields);

      return {
        ...result,
        items: await attachNotes("ASSET", result.items),
      };
    }),

  // GET /api/versions/{id}/assets - Assets that run one product version
  getManyByVersion: protectedProcedure
    .input(paginationInputSchema.extend({ id: z.string() }))
    .meta({
      openapi: {
        method: "GET",
        path: "/versions/{id}/assets",
        tags: ["Assets", "Versions"],
        summary: "List Assets by Version",
        description: "Get the assets that run one product version.",
      },
    })
    .output(paginatedAssetResponseSchema)
    .query(async ({ input }) => {
      const version = await prisma.version.findUnique({
        where: { id: input.id },
        select: { id: true },
      });
      requireExistence(version, "Version");
      const result = await fetchPaginated(prisma.asset, input, {
        where: {
          versionId: input.id,
          ...createSearchFilter(input.search),
        },
        include: assetInclude,
      });
      return {
        ...result,
        items: await attachNotes("ASSET", result.items),
      };
    }),

  // Assets used in a clinical workflow — either linked directly to one of its
  // nodes, or matched by a node's device-group matching.
  getManyByWorkflow: protectedProcedure
    .input(z.object({ id: z.string() }))
    .output(assetArrayResponseSchema)
    .query(async ({ input }) => {
      const { id: workflowId } = input;

      const matchings = await prisma.deviceGroupMatching.findMany({
        where: { nodes: { some: { workflowId } } },
        select: {
          manufacturerId: true,
          productId: true,
          versionId: true,
          versionRange: true,
        },
      });
      const matchedWhere = await assetWhereForMatchings(matchings, {
        loose: true,
      });

      // Find assets that are directly linked by a node
      // and assets that are indirectly linked via a node's matching
      const assets = await prisma.asset.findMany({
        where: {
          OR: [{ nodes: { some: { workflowId } } }, matchedWhere],
        },
        include: assetInclude,
        orderBy: { updatedAt: "desc" },
      });

      return attachNotes("ASSET", assets);
    }),

  // not exposed on OpenAPI
  getManyInternal: protectedProcedure
    .input(paginationInputSchema)
    .query(async ({ input }) => {
      const { search, sort } = input;

      const where = createSearchFilter(search);

      return fetchPaginated(prisma.asset, input, {
        where: where,
        include: { ...assetInclude, issues: true },
        orderBy: assetOrderBy(sort),
      });
    }),

  // TODO: VW-82 -- do sorting in SQL, not by loading all assets and doing it manually
  // big scalability concern, but I'm leaving this here for now before demo
  getManyDashboardInternal: protectedProcedure
    .input(paginationInputSchema.extend({ source: z.string().default("") }))
    .query(async ({ input }) => {
      const { search, sort, source } = input;
      const importedFromSource = source
        ? { externalMappings: { some: { integrationId: source } } }
        : {};
      const where = { ...createSearchFilter(search), ...importedFromSource };

      const computedKeys: string[] = [
        ...AFFECTED_ISSUE_SORT_KEYS,
        "remediations",
      ];
      const sortFields = sort ? sort.split(",").filter(Boolean) : [];
      const hasComputedSort = sortFields.some((field) =>
        computedKeys.includes(sortFieldKey(field)),
      );

      if (!hasComputedSort) {
        const result = await fetchPaginated(prisma.asset, input, {
          where,
          include: assetDashboardInclude,
          orderBy: assetOrderBy(sort),
        });
        const effectiveIssues = await resolveEffectiveIssuesByAsset(
          result.items,
          assetDashboardInclude.issues.include,
        );
        return {
          ...result,
          items: result.items.map((asset) => ({
            ...asset,
            issues: effectiveIssues.get(asset.id) ?? [],
          })),
        };
      }

      const fetchedAssets = await prisma.asset.findMany({
        where: { ...where, ...buildUpdatedAtFilter(input) },
        include: assetDashboardInclude,
      });
      const meta = buildPaginationMeta(input, fetchedAssets.length);
      const effectiveIssues = await resolveEffectiveIssuesByAsset(
        fetchedAssets,
        assetDashboardInclude.issues.include,
      );
      const allAssets = fetchedAssets.map((asset) => ({
        ...asset,
        issues: effectiveIssues.get(asset.id) ?? [],
      }));

      type AssetRow = (typeof allAssets)[number];

      function getComputedValue(asset: AssetRow, key: string): number | string {
        const issueValue = affectedIssueSortValue(
          countAffectedIssues(asset.issues),
          key,
        );
        if (issueValue !== undefined) return issueValue;
        if (key === "remediations") {
          return countAffectedRemediations(asset.issues);
        }
        return assetColumnSortValue(asset, key);
      }

      const sortedAssets = sortByFields(
        allAssets,
        sortFields,
        getComputedValue,
      );

      const items = sortedAssets.slice(meta.skip, meta.skip + meta.take);
      return createPaginatedResponse(items, meta);
    }),

  // TODO: VW-511 -- full table load-and-merge: every asset plus all effective issues,
  // worst case O(assets * vulnerabilities), on every dashboard load and status change
  getIssueMetricsInternal: protectedProcedure.query(async () => {
    const severities = Object.values(Severity);

    const assets = await prisma.asset.findMany({
      select: deviceIdentitySelect,
    });
    const effectiveIssuesByAssetId = await resolveEffectiveIssuesByAsset(
      assets,
      {
        vulnerability: {
          select: {
            severity: true,
            _count: { select: { remediations: true } },
          },
        },
      },
    );

    const counts = {} as Record<
      Severity,
      { active: number; activeWithRemediations: number; remediated: number }
    >;
    const totals = {
      active: 0,
      activeWithRemediations: 0,
      remediated: 0,
    };
    for (const severity of severities) {
      counts[severity] = {
        active: 0,
        activeWithRemediations: 0,
        remediated: 0,
      };
    }

    for (const effectiveIssues of effectiveIssuesByAssetId.values()) {
      for (const issue of effectiveIssues) {
        const severityCounts = counts[issue.vulnerability.severity];
        const hasRemediation = issue.vulnerability._count.remediations > 0;

        if (issue.status === IssueStatus.AFFECTED) {
          severityCounts.active++;
          totals.active++;
          if (hasRemediation) {
            severityCounts.activeWithRemediations++;
            totals.activeWithRemediations++;
          }
        } else if (issue.status === IssueStatus.FIXED) {
          severityCounts.remediated++;
          totals.remediated++;
        }
      }
    }

    return { ...counts, totals };
  }),

  // Internal API for asset vulnerability matching
  // Used only on workflow node detail
  getManyWithVulns: protectedProcedure
    .input(assetsVulnsInputSchema)
    .query(async ({ input }) => {
      const { deviceGroupMatchingIds, assetIds } = input;

      // Assets are matched directly by id and/or via the device-group matchings
      // the node links (each matching resolves to the assets it applies to).
      const orConditions: Prisma.AssetWhereInput[] = [];
      if (assetIds?.length) orConditions.push({ id: { in: assetIds } });
      if (deviceGroupMatchingIds?.length) {
        const matchings = await prisma.deviceGroupMatching.findMany({
          where: { id: { in: deviceGroupMatchingIds } },
          select: {
            manufacturerId: true,
            productId: true,
            versionId: true,
            versionRange: true,
          },
        });
        orConditions.push(
          await assetWhereForMatchings(matchings, { loose: true }),
        );
      }

      // No resolvable filters => nothing matches.
      if (orConditions.length === 0) {
        return {
          assets: [],
          assetsCount: 0,
          vulnerabilities: [],
          vulnerabilitiesCount: 0,
        };
      }

      const where = { OR: orConditions };
      const assetsCount = await prisma.asset.count({ where: where });

      const assetItems = await prisma.asset.findMany({
        where: where,
        include: assetInclude,
        orderBy: { updatedAt: "desc" },
      });

      // Find every vulnerability whose matchings apply to these assets.
      const vulnerabilities =
        await findVulnerabilitiesMatchingDevices(assetItems);

      return {
        assets: assetItems,
        assetsCount,
        vulnerabilities,
        vulnerabilitiesCount: vulnerabilities.length,
      };
    }),

  // GET /api/assets/{asset_id} - Get single asset (any authenticated user can access)
  getOne: protectedProcedure
    .input(z.object({ id: z.string() }))
    .meta({
      openapi: {
        method: "GET",
        path: "/assets/{id}",
        tags: ["Assets"],
        summary: "Get Asset",
        description:
          "Get a single asset by ID. Any authenticated user can view any asset.",
      },
    })
    .output(assetResponseSchema)
    .query(async ({ input }) => {
      const asset = await prisma.asset.findUnique({
        where: { id: input.id },
        include: assetInclude,
      });
      const found = requireExistence(asset, "Asset");
      return attachNote("ASSET", found);
    }),

  // Internal: a single asset's utilization schedule rendered as a readable summary.
  // Used by the chat agent's query_platform_data tool for progressive disclosure
  getUtilization: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ input }) => {
      const asset = await prisma.asset.findUnique({
        where: { id: input.id },
        select: { utilization: true },
      });
      const found = requireExistence(asset, "Asset");
      return { utilization: renderUtilization(found.utilization) };
    }),

  getUtilizationGrid: protectedProcedure
    .input(z.object({ assetIds: z.array(z.string()).min(1) }))
    .query(({ input }) =>
      fetchUtilizationGrids({ id: { in: input.assetIds } }),
    ),

  // POST /api/assets - Create asset
  create: protectedProcedure
    .input(assetInputSchema)
    .meta({
      openapi: {
        method: "POST",
        path: "/assets",
        tags: ["Assets"],
        summary: "Create Asset",
        description:
          "Create a new asset. The authenticated user will be recorded as the creator.",
      },
    })
    .output(assetResponseSchema)
    .mutation(async ({ ctx, input }) => {
      const {
        device: deviceInput,
        utilization,
        deviceType,
        ...dataInput
      } = input;
      const applyDeviceType = await prepareDeviceTypeSlugs([deviceType]);
      const device = await deviceInputToAsset(deviceInput);
      await applyDeviceType(device.productId, deviceType);
      return prisma.asset.create({
        data: {
          ...dataInput,
          utilization: utilization as Prisma.InputJsonValue | undefined,
          ...device,
          userId: ctx.auth.user.id,
        },
        include: assetInclude,
      });
    }),

  // POST /api/assets/bulk - Create one or more assets
  createBulk: protectedProcedure
    .input(assetArrayInputSchema)
    .meta({
      openapi: {
        method: "POST",
        path: "/assets/bulk",
        tags: ["Assets"],
        summary: "Create Bulk Assets",
        description:
          "Create one or more new assets from an array. The authenticated user will be recorded as the creator.",
      },
    })
    .output(assetArrayResponseSchema)
    .mutation(async ({ ctx, input }) => {
      const applyDeviceType = await prepareDeviceTypeSlugs(
        input.assets.map((asset) => asset.deviceType),
      );
      // resolve all devices in parallel
      const devices = await Promise.all(
        input.assets.map(({ device }) => deviceInputToAsset(device)),
      );
      for (const [index, { deviceType }] of input.assets.entries()) {
        await applyDeviceType(devices[index].productId, deviceType);
      }

      // create all assets in a transaction
      return prisma.$transaction(
        input.assets.map((asset, index) => {
          const {
            device: _device,
            utilization,
            deviceType: _deviceType,
            ...dataInput
          } = asset;
          return prisma.asset.create({
            data: {
              ...dataInput,
              utilization: utilization as Prisma.InputJsonValue | undefined,
              ...devices[index],
              userId: ctx.auth.user.id,
            },
            include: assetInclude,
          });
        }),
      );
    }),

  processIntegrationCreate: baseProcedure
    .input(integrationAssetInputSchema)
    .meta({
      openapi: {
        method: "POST",
        path: "/assets/integrationUpload/{token}",
        tags: ["Assets"],
        summary: "Synchronize assets with integration",
        description: "Synchronize Assets on VIPER from a partnered platform",
      },
    })
    .output(integrationResponseSchema)
    .mutation(async ({ input }) => {
      // The token is one-time: reject unknown slugs before it is spent, so
      // the partner can retry the batch with the same token.
      const applyDeviceType = await prepareDeviceTypeSlugs(
        input.items.map((item) => item.deviceType),
      );
      // Validate provided token or throw error
      const { userId, integrationId } = await processIntegrationToken(
        input.token,
        ResourceType.Asset,
      );

      return processAssetIntegrationSync(
        input,
        userId,
        integrationId,
        applyDeviceType,
      );
    }),

  // not exposed on OpenAPI
  getRecentVulnerableInternal: protectedProcedure
    .input(
      z.object({
        pageSize: z.number().int().min(1).max(100).default(10),
        createdAfter: z.date(),
      }),
    )
    .query(async ({ input }) => {
      const recentAssets = await prisma.asset.findMany({
        where: { createdAt: { gte: input.createdAfter } },
        include: assetDashboardInclude,
        orderBy: { createdAt: "desc" },
      });
      const effectiveIssues = await resolveEffectiveIssuesByAsset(
        recentAssets,
        assetDashboardInclude.issues.include,
      );
      const recentAssetsWithEffectiveIssues = recentAssets.map((asset) => ({
        ...asset,
        issues: effectiveIssues.get(asset.id) ?? [],
      }));
      const newlyVulnerableAssets = recentAssetsWithEffectiveIssues.filter(
        (asset) =>
          asset.issues.some((issue) => issue.status === IssueStatus.AFFECTED),
      );

      return {
        items: newlyVulnerableAssets.slice(0, input.pageSize),
        totalCount: newlyVulnerableAssets.length,
      };
    }),

  // DELETE /api/assets/{asset_id} - Delete asset (only creator can delete)
  remove: protectedProcedure
    .input(z.object({ id: z.string() }))
    .meta({
      openapi: {
        method: "DELETE",
        path: "/assets/{id}",
        tags: ["Assets"],
        summary: "Delete Asset",
        description:
          "Delete an asset. Only the user who created the asset can delete it.",
      },
    })
    .output(assetResponseSchema)
    .mutation(async ({ ctx, input }) => {
      // Verify ownership
      await requireOwnership(input.id, ctx.auth.user.id, "asset");

      return prisma.$transaction(async (tx) => {
        await tx.workOrderTicket.deleteMany({
          where: { ticket: { assetId: input.id } },
        });
        return tx.asset.delete({
          where: { id: input.id },
          include: assetInclude,
        });
      });
    }),

  // PATCH /api/assets/{asset_id} - Partial update asset (only creator can update)
  update: protectedProcedure
    .input(updateAssetSchema)
    .meta({
      openapi: {
        method: "PATCH",
        path: "/assets/{id}",
        tags: ["Assets"],
        summary: "Update Asset",
        description:
          "Partially update an asset. Only the user who created the asset can update it.",
      },
    })
    .output(assetResponseSchema)
    .mutation(async ({ ctx, input }) => {
      await requireOwnership(input.id, ctx.auth.user.id, "asset");

      const {
        id,
        device: deviceInput,
        utilization,
        deviceType,
        ...updateData
      } = input;
      const applyDeviceType = await prepareDeviceTypeSlugs([deviceType]);
      const current = await prisma.asset.findUniqueOrThrow({
        where: { id },
        select: { productId: true },
      });

      const device =
        deviceInput === undefined
          ? undefined
          : await deviceInputToAsset(deviceInput);
      await applyDeviceType(device?.productId ?? current.productId, deviceType);
      return prisma.asset.update({
        where: { id },
        data: {
          ...device,
          ...updateData,
          utilization: utilization as Prisma.InputJsonValue | undefined,
        },
        include: assetInclude,
      });
    }),
});
