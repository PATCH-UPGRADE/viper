import { TRPCError } from "@trpc/server";
import { z } from "zod";
import prisma from "@/lib/db";
import {
  buildPaginationMeta,
  createPaginatedResponse,
  createPaginatedResponseSchema,
  createPaginatedResponseWithLinksSchema,
  paginationInputSchema,
} from "@/lib/pagination";
import { cpeToDeviceGroup } from "@/lib/router-utils";
import {
  cpeSchema,
  deviceGroupSchema,
  deviceGroupSelect,
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
const integrationResponseSchema = z.object({});

// NOTE: tRPC / OpenAPI doesn't allow for arrays as the INPUT schema
// if you try it will default to a single asset schema
// to get around that wrap the array of assets in an object
const assetArrayInputSchema = z.object({
  assets: z.array(assetInputSchema).nonempty(),
});

const assetResponseSchema = z.object({
  id: z.string(),
  ip: z.string(),
  deviceGroup: deviceGroupSchema,
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

const assetArrayResponseSchema = z.array(assetResponseSchema);

const paginatedAssetResponseSchema =
  createPaginatedResponseSchema(assetResponseSchema);

const integrationAssetInputSchema = createPaginatedResponseWithLinksSchema(
  integrationAssetSchema,
).extend({
  vendor: z.string(),
});

const settingsResponseSchema = z.object({
  id: z.string(),
  url: z.string(),
  name: z.string(),
  hasToken: z.boolean(),
  userId: z.string(),
  createdAt: z.date(),
  updatedAt: z.date(),
  user: userSchema,
});

const _paginatedSettingsResponseSchema = createPaginatedResponseSchema(
  settingsResponseSchema,
);

const assetsVulnsInputSchema = z.object({
  assetIds: z.array(z.string()).optional(),
  cpes: z.array(cpeSchema).optional(),
});
export type AssetsVulnsInput = z.infer<typeof assetsVulnsInputSchema>;

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

      // Build search filter across multiple fields
      const where = search
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

      // Get total count and build pagination metadata
      const totalCount = await prisma.asset.count({ where: where });
      const meta = buildPaginationMeta(input, totalCount);

      // Fetch paginated items
      const items = await prisma.asset.findMany({
        skip: meta.skip,
        take: meta.take,
        where: where,
        include: { user: userIncludeSelect, deviceGroup: deviceGroupSelect },
        orderBy: { createdAt: "desc" },
      });

      return createPaginatedResponse(items, meta);
    }),

  // not exposed on OpenAPI
  getManyInternal: protectedProcedure
    .input(paginationInputSchema)
    .query(async ({ input }) => {
      const { search, sort } = input;

      // Build search filter across multiple fields
      const where = search
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

      // Get total count and build pagination metadata
      const totalCount = await prisma.asset.count({ where: where });
      const meta = buildPaginationMeta(input, totalCount);

      function getSortValue(sort: string) {
        const sortValue = sort.startsWith("-") ? "desc" : "asc";
        if (sort === "issues" || sort === "-issues") {
          return { _count: sortValue };
        }
        return sortValue;
      }

      // Fetch paginated items
      const items = await prisma.asset.findMany({
        skip: meta.skip,
        take: meta.take,
        where: where,
        include: {
          user: userIncludeSelect,
          deviceGroup: deviceGroupSelect,
          issues: true,
        },
        orderBy: sort
          ? [
              ...sort.split(",").map((s) => {
                return { [s.replace("-", "")]: getSortValue(s) };
              }),
              { updatedAt: "desc" },
            ]
          : { updatedAt: "desc" },
      });

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
  // TODO: VW-38
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
    .mutation(() => {
      throw new TRPCError({
        code: "NOT_IMPLEMENTED",
        message: "This endpoint is not implemented yet.",
      });
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
