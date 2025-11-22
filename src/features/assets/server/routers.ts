import prisma from "@/lib/db";
import { createTRPCRouter, protectedProcedure } from "@/trpc/init";
import z from "zod";
import {
  userSchema,
  userIncludeSelect,
  safeUrlSchema,
  cpeSchema,
} from "@/lib/schemas";
import {
  paginationInputSchema,
  buildPaginationMeta,
  createPaginatedResponse,
  createPaginatedResponseSchema,
} from "@/lib/pagination";
import { requireOwnership } from "@/trpc/middleware";

// Validation schemas matching the FastAPI spec
const assetInputSchema = z.object({
  ip: z.string().min(1),
  cpe: cpeSchema,
  role: z.string().min(1),
  upstreamApi: safeUrlSchema,
});

const assetSettingsInputSchema = z.object({
  url: safeUrlSchema,
  name: z.string().min(1),
  token: z.string().min(1),
});

const assetResponseSchema = z.object({
  id: z.string(),
  ip: z.string(),
  cpe: z.string(),
  role: z.string(),
  upstreamApi: z.string(),
  userId: z.string(),
  createdAt: z.date(),
  updatedAt: z.date(),
  user: userSchema,
});

const paginatedAssetResponseSchema = createPaginatedResponseSchema(assetResponseSchema);

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

const paginatedSettingsResponseSchema = createPaginatedResponseSchema(settingsResponseSchema);

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
        description: "Get all assets. Any authenticated user can view all assets.",
      },
    })
    .output(paginatedAssetResponseSchema)
    .query(async ({ input }) => {
      const { search } = input;

      // Build search filter across multiple fields
      const searchFilter = search
        ? {
            OR: [
              { ip: { contains: search, mode: "insensitive" as const } },
              { cpe: { contains: search, mode: "insensitive" as const } },
              { role: { contains: search, mode: "insensitive" as const } },
            ],
          }
        : {};

      // Get total count and build pagination metadata
      const totalCount = await prisma.asset.count({ where: searchFilter });
      const meta = buildPaginationMeta(input, totalCount);

      // Fetch paginated items
      const items = await prisma.asset.findMany({
        skip: meta.skip,
        take: meta.take,
        where: searchFilter,
        include: { user: userIncludeSelect },
        orderBy: { createdAt: "desc" },
      });

      return createPaginatedResponse(items, meta);
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
        description: "Get a single asset by ID. Any authenticated user can view any asset.",
      },
    })
    .output(assetResponseSchema)
    .query(async ({ input }) => {
      return prisma.asset.findUniqueOrThrow({
        where: { id: input.id },
        include: { user: userIncludeSelect },
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
        description: "Create a new asset. The authenticated user will be recorded as the creator.",
      },
    })
    .output(assetResponseSchema)
    .mutation(({ ctx, input }) => {
      return prisma.asset.create({
        data: {
          ...input,
          userId: ctx.auth.user.id,
        },
        include: { user: userIncludeSelect },
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
        description: "Delete an asset. Only the user who created the asset can delete it.",
      },
    })
    .output(assetResponseSchema)
    .mutation(async ({ ctx, input }) => {
      // Verify ownership
      await requireOwnership(input.id, ctx.auth.user.id, "asset");

      return prisma.asset.delete({
        where: { id: input.id },
        include: { user: userIncludeSelect },
      });
    }),

  // PUT /api/assets/{asset_id} - Update asset (only creator can update)
  update: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        ip: z.string().min(1),
        cpe: cpeSchema,
        role: z.string().min(1),
        upstreamApi: safeUrlSchema,
      })
    )
    .meta({
      openapi: {
        method: "PUT",
        path: "/assets/{id}",
        tags: ["Assets"],
        summary: "Update Asset",
        description: "Update an asset. Only the user who created the asset can update it.",
      },
    })
    .output(assetResponseSchema)
    .mutation(async ({ ctx, input }) => {
      // Verify ownership
      await requireOwnership(input.id, ctx.auth.user.id, "asset");

      const { id, ...updateData } = input;
      return prisma.asset.update({
        where: { id },
        data: updateData,
        include: { user: userIncludeSelect },
      });
    }),

  // GET /api/assets/settings - List all asset settings
  getSettings: protectedProcedure
    .input(paginationInputSchema)
    .meta({
      openapi: {
        method: "GET",
        path: "/assets/settings",
        tags: ["Assets"],
        summary: "Get Asset Manager Settings",
        description: "Get all asset managers that have been set up. Any authenticated user can view all settings.",
      },
    })
    .output(paginatedSettingsResponseSchema)
    .query(async ({ input }) => {
      const { search } = input;

      const searchFilter = search
        ? {
            OR: [
              { name: { contains: search, mode: "insensitive" as const } },
              { url: { contains: search, mode: "insensitive" as const } },
            ],
          }
        : {};

      // Get total count and build pagination metadata
      const totalCount = await prisma.assetSettings.count({ where: searchFilter });
      const meta = buildPaginationMeta(input, totalCount);

      // Fetch paginated items
      const rawItems = await prisma.assetSettings.findMany({
        skip: meta.skip,
        take: meta.take,
        where: searchFilter,
        select: {
          id: true,
          url: true,
          name: true,
          token: true, // Select to check if exists, but don't return
          userId: true,
          createdAt: true,
          updatedAt: true,
          user: userIncludeSelect,
        },
        orderBy: { createdAt: "desc" },
      });

      // Map items to exclude token and add hasToken flag
      const items = rawItems.map(({ token, ...item }) => ({
        ...item,
        hasToken: !!token && token.length > 0,
      }));

      return createPaginatedResponse(items, meta);
    }),

  // POST /api/assets/settings - Create asset setting
  createSetting: protectedProcedure
    .input(assetSettingsInputSchema)
    .meta({
      openapi: {
        method: "POST",
        path: "/assets/settings",
        tags: ["Assets"],
        summary: "Create Asset Manager",
        description: "Create a new asset manager to sync from. The authenticated user will be recorded as the creator.",
      },
    })
    .output(settingsResponseSchema)
    .mutation(async ({ ctx, input }) => {
      const created = await prisma.assetSettings.create({
        data: {
          ...input,
          userId: ctx.auth.user.id,
        },
        select: {
          id: true,
          url: true,
          name: true,
          token: true, // Select to check if exists, but don't return
          userId: true,
          createdAt: true,
          updatedAt: true,
          user: userIncludeSelect,
        },
      });

      // Exclude token from response, add hasToken flag
      const { token, ...response } = created;
      return {
        ...response,
        hasToken: !!token && token.length > 0,
      };
    }),
});
