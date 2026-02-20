import { z } from "zod";
import { IssueStatus, Severity } from "@/generated/prisma";
import prisma from "@/lib/db";
import {
  buildPaginationMeta,
  createPaginatedResponse,
  paginationInputSchema,
} from "@/lib/pagination";
import {
  cpeToDeviceGroup,
  fetchPaginated,
  processIntegrationSync,
} from "@/lib/router-utils";
import { integrationResponseSchema } from "@/lib/schemas";
import { createTRPCRouter, protectedProcedure } from "@/trpc/init";
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

const createSearchFilter = (search: string) => {
  return search
    ? {
        OR: [
          { ip: { contains: search, mode: "insensitive" as const } },
          { role: { contains: search, mode: "insensitive" as const } },
          {
            deviceGroup: {
              cpe: {
                contains: search,
                mode: "insensitive" as const,
              },
            },
          },
        ],
      }
    : {};
};

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
      const { search } = input;

      const where = createSearchFilter(search);

      return fetchPaginated(prisma.asset, input, {
        where: where,
        include: assetInclude,
      });
    }),

  // GET /api/deviceGroups/{deviceGroupId}/assets - List assets for a device group
  getManyByDeviceGroup: protectedProcedure
    .input(
      paginationInputSchema.extend({
        deviceGroupId: z.string(),
      }),
    )
    .meta({
      openapi: {
        method: "GET",
        path: "/deviceGroups/{deviceGroupId}/assets",
        tags: ["Assets", "DeviceGroups"],
        summary: "List Assets by Device Group",
        description:
          "Get all assets affecting a specific device group. Any authenticated user can view all assets.",
      },
    })
    .output(paginatedAssetResponseSchema)
    .query(async ({ input }) => {
      const { search, deviceGroupId } = input;
      const searchFilter = createSearchFilter(search);
      const whereFilter = search
        ? {
            AND: [
              searchFilter,
              {
                deviceGroup: {
                  id: deviceGroupId,
                },
              },
            ],
          }
        : {
            deviceGroup: {
              id: deviceGroupId,
            },
          };
      return fetchPaginated(prisma.asset, input, {
        where: whereFilter,
        include: assetInclude,
      });
    }),

  // not exposed on OpenAPI
  getManyInternal: protectedProcedure
    .input(paginationInputSchema)
    .query(async ({ input }) => {
      const { search, sort } = input;

      const where = createSearchFilter(search);

      function getSortValue(sort: string) {
        const sortValue = sort.startsWith("-") ? "desc" : "asc";
        if (sort === "issues" || sort === "-issues") {
          return { _count: sortValue };
        }
        return sortValue;
      }

      return fetchPaginated(prisma.asset, input, {
        where: where,
        include: { ...assetInclude, issues: true },
        orderBy: sort
          ? [
              ...sort.split(",").map((s) => {
                return { [s.replace("-", "")]: getSortValue(s) };
              }),
              { updatedAt: "desc" },
            ]
          : { updatedAt: "desc" },
      });
    }),

  getManyDashboardInternal: protectedProcedure
    .input(paginationInputSchema)
    .query(async ({ input }) => {
      const { search, sort } = input;
      const where = createSearchFilter(search);

      const computedKeys = [
        "severity_Critical",
        "severity_High",
        "severity_Medium",
        "severity_Low",
        "remediations",
      ];
      const sortFields = sort ? sort.split(",").filter(Boolean) : [];
      const hasComputedSort = sortFields.some((s) =>
        computedKeys.some((key) => s === key || s === `-${key}`),
      );

      if (!hasComputedSort) {
        function getSortValue(sort: string) {
          const sortValue = sort.startsWith("-") ? "desc" : "asc";
          if (sort === "issues" || sort === "-issues") {
            return { _count: sortValue };
          }
          return sortValue;
        }

        return fetchPaginated(prisma.asset, input, {
          where,
          include: assetDashboardInclude,
          orderBy: sort
            ? [
                ...sort.split(",").map((s) => {
                  return { [s.replace("-", "")]: getSortValue(s) };
                }),
                { updatedAt: "desc" },
              ]
            : { updatedAt: "desc" },
        });
      }

      const totalCount = await prisma.asset.count({ where });
      const meta = buildPaginationMeta(input, totalCount);

      const allAssets = await prisma.asset.findMany({
        where,
        include: assetDashboardInclude,
      });

      type AssetRow = (typeof allAssets)[number];

      function activeBySeverity(asset: AssetRow, severity: Severity): number {
        return asset.issues.filter(
          (i) =>
            i.status === IssueStatus.ACTIVE &&
            i.vulnerability.severity === severity,
        ).length;
      }

      function remediationCount(asset: AssetRow): number {
        const seen = new Set<string>();
        let total = 0;
        for (const issue of asset.issues) {
          if (
            issue.status === IssueStatus.ACTIVE &&
            !seen.has(issue.vulnerabilityId)
          ) {
            seen.add(issue.vulnerabilityId);
            total += issue.vulnerability._count.remediations;
          }
        }
        return total;
      }

      function getComputedValue(asset: AssetRow, key: string): number | string {
        if (key.startsWith("severity_")) {
          const severity = key.replace("severity_", "") as Severity;
          return activeBySeverity(asset, severity);
        }
        if (key === "remediations") {
          return remediationCount(asset);
        }
        const val = (asset as Record<string, unknown>)[key];
        return typeof val === "string" ? val : String(val ?? "");
      }

      allAssets.sort((a, b) => {
        for (const field of sortFields) {
          const desc = field.startsWith("-");
          const key = desc ? field.slice(1) : field;
          const aVal = getComputedValue(a, key);
          const bVal = getComputedValue(b, key);

          let cmp: number;
          if (typeof aVal === "number" && typeof bVal === "number") {
            cmp = aVal - bVal;
          } else {
            cmp = String(aVal).localeCompare(String(bVal));
          }

          if (cmp !== 0) return desc ? -cmp : cmp;
        }
        return (
          new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
        );
      });

      const items = allAssets.slice(meta.skip, meta.skip + meta.take);
      return createPaginatedResponse(items, meta);
    }),

  // Internal API for asset vulnerability matching
  getManyWithVulns: protectedProcedure
    .input(assetsVulnsInputSchema)
    .query(async ({ input }) => {
      const { cpes, assetIds } = input;

      // Return empty results if no filters provided
      if (
        (!assetIds || assetIds.length === 0) &&
        (!cpes || cpes.length === 0)
      ) {
        return {
          assets: [],
          assetsCount: 0,
          vulnerabilities: [],
          vulnerabilitiesCount: 0,
        };
      }

      const where = {
        OR: [
          ...(assetIds?.length ? [{ id: { in: assetIds } }] : []),
          ...(cpes?.length ? [{ deviceGroup: { cpe: { in: cpes } } }] : []),
          // TODO:: ^this needs to be a pattern match, not just "in"
        ],
      };
      const assetsCount = await prisma.asset.count({ where: where });

      const assetItems = await prisma.asset.findMany({
        where: where,
        include: assetInclude,
        orderBy: { updatedAt: "desc" },
      });

      const assetCpes = assetItems
        .map((asset) => asset.deviceGroup.cpe)
        .filter(Boolean);
      const allCpes = [...new Set([...(cpes ?? []), ...assetCpes])];

      const vulnsWhere = {
        affectedDeviceGroups: { some: { cpe: { in: allCpes } } },
      };
      const vulnsCount = await prisma.vulnerability.count({
        where: vulnsWhere,
      });
      const vulnerabilities = await prisma.vulnerability.findMany({
        where: vulnsWhere,
      });

      return {
        assets: assetItems,
        assetsCount,
        vulnerabilities,
        vulnerabilitiesCount: vulnsCount,
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
      return requireExistence(asset, "Asset");
    }),

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
      const { cpe, ...dataInput } = input;
      const deviceGroup = await cpeToDeviceGroup(cpe);
      return prisma.asset.create({
        data: {
          ...dataInput,
          deviceGroupId: deviceGroup.id,
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
      // resolve all device groups in parallel
      const deviceGroupPromises = input.assets.map(async (asset) => {
        const { cpe } = asset;
        return await cpeToDeviceGroup(cpe);
      });

      const deviceGroups = await Promise.all(deviceGroupPromises);

      // create all assets in a transaction
      return prisma.$transaction(
        input.assets.map((asset, index) => {
          const { cpe: _cpe, ...dataInput } = asset;
          return prisma.asset.create({
            data: {
              ...dataInput,
              deviceGroupId: deviceGroups[index].id,
              userId: ctx.auth.user.id,
            },
            include: assetInclude,
          });
        }),
      );
    }),

  processIntegrationCreate: protectedProcedure
    .input(integrationAssetInputSchema)
    .meta({
      openapi: {
        method: "POST",
        path: "/assets/integrationUpload",
        tags: ["Assets"],
        summary: "Synchronize assets with integration",
        description: "Synchronize assets on VIPER from a partnered platform",
      },
    })
    .output(integrationResponseSchema)
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.auth.user.id;
      const foundIntegration = await prisma.integration.findFirstOrThrow({
        // @ts-expect-error ctx.auth.key.id is defined if logging in with api key
        where: { apiKey: { id: ctx.auth.key?.id } },
        select: { id: true },
      });
      const integrationId = foundIntegration.id;

      return processIntegrationSync(
        prisma,
        {
          model: prisma.asset,
          mappingModel: prisma.externalAssetMapping,
          transformInputItem: async (item, userId) => {
            const { cpe, vendorId: _vendorId, ...itemData } = item;
            const deviceGroup = await cpeToDeviceGroup(cpe);

            const uniqueFields = [
              "hostname",
              "macAddress",
              "serialNumber",
            ] as const;
            const uniqueFieldConditions = uniqueFields
              .filter((field) => itemData[field])
              .map((field) => ({ [field]: itemData[field] }));

            return {
              createData: {
                ...itemData,
                deviceGroupId: deviceGroup.id,
                userId,
              },
              updateData: {
                ...itemData,
                deviceGroupId: deviceGroup.id,
              },
              uniqueFieldConditions,
            };
          },
        },
        input,
        userId,
        integrationId,
      );
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

      return prisma.asset.delete({
        where: { id: input.id },
        include: assetInclude,
      });
    }),

  // PUT /api/assets/{asset_id} - Update asset (only creator can update)
  update: protectedProcedure
    .input(updateAssetSchema)
    .meta({
      openapi: {
        method: "PUT",
        path: "/assets/{id}",
        tags: ["Assets"],
        summary: "Update Asset",
        description:
          "Update an asset. Only the user who created the asset can update it.",
      },
    })
    .output(assetResponseSchema)
    .mutation(async ({ ctx, input }) => {
      // Verify ownership
      await requireOwnership(input.id, ctx.auth.user.id, "asset");

      const { id, cpe, ...updateData } = input;
      const deviceGroup = await cpeToDeviceGroup(cpe);
      return prisma.asset.update({
        where: { id },
        data: {
          deviceGroupId: deviceGroup.id,
          ...updateData,
        },
        include: assetInclude,
      });
    }),
});
