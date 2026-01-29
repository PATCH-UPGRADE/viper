import { z } from "zod";
import { type Asset, SyncStatusEnum } from "@/generated/prisma";
import {
  PrismaClientKnownRequestError,
  PrismaClientValidationError,
} from "@/generated/prisma/runtime/library";
import prisma from "@/lib/db";
import {
  createPaginatedResponseSchema,
  createPaginatedResponseWithLinksSchema,
  paginationInputSchema,
} from "@/lib/pagination";
import { cpeToDeviceGroup, fetchPaginated } from "@/lib/router-utils";
import {
  cpeSchema,
  deviceGroupSelect,
  deviceGroupWithUrlsSchema,
  safeUrlSchema,
  userIncludeSelect,
  userSchema,
} from "@/lib/schemas";
import { createTRPCRouter, protectedProcedure } from "@/trpc/init";
import { requireOwnership } from "@/trpc/middleware";

const AssetStatus = z.enum(["Active", "Decommissioned", "Maintenance"]);

const assetInputSchema = z.object({
  ip: z.string().min(1),
  networkSegment: z.string().optional(),
  cpe: cpeSchema,
  role: z.string().min(1),
  upstreamApi: safeUrlSchema,
  hostname: z.string().optional(),
  macAddress: z.string().optional(),
  serialNumber: z.string().optional(),
  location: z
    .object({
      facility: z.string().optional(),
      building: z.string().optional(),
      floor: z.string().optional(),
      room: z.string().optional(),
    })
    .optional(),
  status: AssetStatus.optional(),
});

const integrationAssetSchema = assetInputSchema.extend({
  vendorId: z.string(),
});
const updateAssetSchema = assetInputSchema.extend({
  id: z.string(),
});
const integrationResponseSchema = z.object({
  message: z.string(),
  createdAssetsCount: z.number(),
  updatedAssetsCount: z.number(),
  shouldRetry: z.boolean(),
  syncedAt: z.string(),
});

// NOTE: tRPC / OpenAPI doesn't allow for arrays as the INPUT schema
// if you try it will default to a single asset schema
// to get around that wrap the array of assets in an object
const assetArrayInputSchema = z.object({
  assets: z.array(assetInputSchema).nonempty(),
});

const assetResponseSchema = z.object({
  id: z.string(),
  ip: z.string(),
  deviceGroup: deviceGroupWithUrlsSchema,
  role: z.string(),
  upstreamApi: z.string(),
  networkSegment: z.string().nullable(),
  hostname: z.string().nullable(),
  macAddress: z.string().nullable(),
  serialNumber: z.string().nullable(),
  location: z.unknown().nullable(),
  status: AssetStatus.nullable(),
  userId: z.string(),
  createdAt: z.date(),
  updatedAt: z.date(),
  user: userSchema,
});
export type AssetResponseSchemaType = z.infer<typeof assetResponseSchema>;

const assetArrayResponseSchema = z.array(assetResponseSchema);

const paginatedAssetResponseSchema =
  createPaginatedResponseSchema(assetResponseSchema);

const integrationAssetInputSchema = createPaginatedResponseWithLinksSchema(
  integrationAssetSchema,
).extend({
  vendor: z.string(),
});

const assetsVulnsInputSchema = z.object({
  assetIds: z.array(z.string()).optional(),
  cpes: z.array(cpeSchema).optional(),
});
export type AssetsVulnsInput = z.infer<typeof assetsVulnsInputSchema>;

const assetInclude = {
  user: userIncludeSelect,
  deviceGroup: deviceGroupSelect,
};

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

  // GET /api/deviceGroups/{deviceGroupId}/assets - List emulators for a device group
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
        include: { user: userIncludeSelect, deviceGroup: deviceGroupSelect },
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
      return prisma.asset.findUniqueOrThrow({
        where: { id: input.id },
        include: { user: userIncludeSelect, deviceGroup: deviceGroupSelect },
      });
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
        include: { user: userIncludeSelect, deviceGroup: deviceGroupSelect },
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
            include: {
              user: userIncludeSelect,
              deviceGroup: deviceGroupSelect,
            },
          });
        }),
      );
    }),

  // POST /api/assets/integrationUpload
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
        where: { apiKey: { userId } },
        select: { id: true },
      });

      const lastSynced = new Date();

      const response = {
        message: "success",
        createdAssetsCount: 0,
        updatedAssetsCount: 0,
        shouldRetry: false,
        syncedAt: lastSynced.toISOString(),
      };

      for (const item of input.items) {
        const { cpe, vendorId, ...assetData } = item;

        // Look for an existing mapping first
        const foundMapping = await prisma.externalAssetMapping.findFirst({
          where: {
            integrationId: foundIntegration.id,
            externalId: vendorId,
          },
          select: {
            id: true,
            itemId: true,
          },
        });

        const deviceGroup = await cpeToDeviceGroup(cpe);

        // If we have a ExternalAssetMapping, update the sync time and asset
        if (foundMapping) {
          try {
            await prisma.$transaction([
              prisma.externalAssetMapping.update({
                where: { id: foundMapping.id },
                data: { lastSynced },
              }),
              prisma.asset.update({
                where: { id: foundMapping.itemId },
                data: {
                  ...assetData,
                  deviceGroupId: deviceGroup.id,
                },
              }),
            ]);
          } catch (error: unknown) {
            response.message = handlePrismaError(error);
            response.shouldRetry = true;
            break;
          }

          response.updatedAssetsCount++;
          continue;
        }

        // avoid nullable unique fields in our where condition
        const OR = [];
        if (assetData.hostname) {
          OR.push({ hostname: assetData.hostname });
        }
        if (assetData.macAddress) {
          OR.push({ macAddress: assetData.macAddress });
        }
        if (assetData.serialNumber) {
          OR.push({ serialNumber: assetData.serialNumber });
        }

        let foundAsset: Asset | null = null;
        if (OR.length > 0) {
          // try to find matching Asset by unique identifying properties
          foundAsset = await prisma.asset.findFirst({
            where: { OR },
          });
        }

        // If no Asset, we need to create the Asset and ExternalAssetMapping
        if (!foundAsset) {
          try {
            await prisma.asset.create({
              data: {
                ...assetData,
                deviceGroupId: deviceGroup.id,
                userId,
                externalMappings: {
                  create: {
                    integrationId: foundIntegration.id,
                    externalId: vendorId,
                    lastSynced,
                  },
                },
              },
            });
          } catch (error: unknown) {
            response.message = handlePrismaError(error);
            response.shouldRetry = true;
            break;
          }

          response.createdAssetsCount++;
          continue;
        }

        try {
          // If we have an Asset but no ExternalAssetMapping then create the mapping
          await prisma.$transaction([
            prisma.externalAssetMapping.create({
              data: {
                itemId: foundAsset.id,
                integrationId: foundIntegration.id,
                externalId: vendorId,
                lastSynced,
              },
            }),
            // and then update the existing Asset
            prisma.asset.update({
              where: { id: foundAsset.id },
              data: {
                ...assetData,
                deviceGroupId: deviceGroup.id,
              },
            }),
          ]);
        } catch (error: unknown) {
          response.message = handlePrismaError(error);
          response.shouldRetry = true;
          break;
        }

        response.updatedAssetsCount++;
      }

      await prisma.syncStatus.create({
        data: {
          integrationId: foundIntegration.id,
          status: response.shouldRetry
            ? SyncStatusEnum.Error
            : SyncStatusEnum.Success,
          errorMessage: response.shouldRetry ? response.message : undefined,
          syncedAt: lastSynced,
        },
      });

      return response;
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
        include: { user: userIncludeSelect, deviceGroup: deviceGroupSelect },
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
        include: { user: userIncludeSelect, deviceGroup: deviceGroupSelect },
      });
    }),
});

const handlePrismaError = (e: unknown): string => {
  if (
    e instanceof PrismaClientKnownRequestError ||
    e instanceof PrismaClientValidationError
  ) {
    return e.message;
  }

  return "Internal Server Error";
};
