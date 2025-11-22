import prisma from "@/lib/db";
import { createTRPCRouter, protectedProcedure } from "@/trpc/init";
import { TRPCError } from "@trpc/server";
import z from "zod";
import { PAGINATION } from "@/config/constants";

// Validation schemas matching the FastAPI spec
const assetInputSchema = z.object({
  ip: z.string().min(1),
  cpe: z.string().regex(/^cpe:2\.3:[^:]+:[^:]+:[^:]+/, "Invalid CPE 2.3 format"),
  role: z.string().min(1),
  upstream_api: z.string().url(),
});

const assetSettingsInputSchema = z.object({
  url: z.string().url(),
  name: z.string().min(1),
  token: z.string().min(1),
});

// Output schemas for OpenAPI spec generation
const userSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string(),
  image: z.string().nullable(),
});

const assetResponseSchema = z.object({
  id: z.string(),
  ip: z.string(),
  cpe: z.string(),
  role: z.string(),
  upstream_api: z.string(),
  userId: z.string(),
  createdAt: z.date(),
  updatedAt: z.date(),
  user: userSchema,
});

const paginatedAssetResponseSchema = z.object({
  items: z.array(assetResponseSchema),
  page: z.number(),
  pageSize: z.number(),
  totalCount: z.number(),
  totalPages: z.number(),
  hasNextPage: z.boolean(),
  hasPreviousPage: z.boolean(),
});

const settingsResponseSchema = z.object({
  id: z.string(),
  url: z.string(),
  name: z.string(),
  token: z.string(),
  userId: z.string(),
  createdAt: z.date(),
  updatedAt: z.date(),
  user: userSchema,
});

const paginatedSettingsResponseSchema = z.object({
  items: z.array(settingsResponseSchema),
  page: z.number(),
  pageSize: z.number(),
  totalCount: z.number(),
  totalPages: z.number(),
  hasNextPage: z.boolean(),
  hasPreviousPage: z.boolean(),
});

export const assetsRouter = createTRPCRouter({
  // GET /api/assets - List all assets (any authenticated user can see all)
  getMany: protectedProcedure
    .input(
      z.object({
        page: z.number().default(PAGINATION.DEFAULT_PAGE),
        pageSize: z
          .number()
          .min(PAGINATION.MIN_PAGE_SIZE)
          .max(PAGINATION.MAX_PAGE_SIZE)
          .default(PAGINATION.DEFAULT_PAGE_SIZE),
        search: z.string().default(""),
      })
    )
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
      const { page, pageSize, search } = input;

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

      const [items, totalCount] = await Promise.all([
        prisma.asset.findMany({
          skip: (page - 1) * pageSize,
          take: pageSize,
          where: searchFilter,
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
                image: true,
              },
            },
          },
          orderBy: {
            createdAt: "desc",
          },
        }),
        prisma.asset.count({
          where: searchFilter,
        }),
      ]);

      const totalPages = Math.ceil(totalCount / pageSize);
      const hasNextPage = page < totalPages;
      const hasPreviousPage = page > 1;

      return {
        items,
        page,
        pageSize,
        totalCount,
        totalPages,
        hasNextPage,
        hasPreviousPage,
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
        description: "Get a single asset by ID. Any authenticated user can view any asset.",
      },
    })
    .output(assetResponseSchema)
    .query(async ({ input }) => {
      return prisma.asset.findUniqueOrThrow({
        where: { id: input.id },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              image: true,
            },
          },
        },
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
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              image: true,
            },
          },
        },
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
      // First check if the asset exists and belongs to the current user
      const asset = await prisma.asset.findUnique({
        where: { id: input.id },
        select: { userId: true },
      });

      if (!asset) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Asset not found",
        });
      }

      if (asset.userId !== ctx.auth.user.id) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You can only delete assets that you created",
        });
      }

      return prisma.asset.delete({
        where: { id: input.id },
      });
    }),

  // GET /api/assets/settings - List all asset settings
  getSettings: protectedProcedure
    .input(
      z.object({
        page: z.number().default(PAGINATION.DEFAULT_PAGE),
        pageSize: z
          .number()
          .min(PAGINATION.MIN_PAGE_SIZE)
          .max(PAGINATION.MAX_PAGE_SIZE)
          .default(PAGINATION.DEFAULT_PAGE_SIZE),
        search: z.string().default(""),
      })
    )
    .meta({
      openapi: {
        method: "GET",
        path: "/assets/settings",
        tags: ["Assets"],
        summary: "Get Asset Settings",
        description: "Get all asset settings. Any authenticated user can view all settings.",
      },
    })
    .output(paginatedSettingsResponseSchema)
    .query(async ({ input }) => {
      const { page, pageSize, search } = input;

      const searchFilter = search
        ? {
            OR: [
              { name: { contains: search, mode: "insensitive" as const } },
              { url: { contains: search, mode: "insensitive" as const } },
            ],
          }
        : {};

      const [items, totalCount] = await Promise.all([
        prisma.assetSettings.findMany({
          skip: (page - 1) * pageSize,
          take: pageSize,
          where: searchFilter,
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
                image: true,
              },
            },
          },
          orderBy: {
            createdAt: "desc",
          },
        }),
        prisma.assetSettings.count({
          where: searchFilter,
        }),
      ]);

      const totalPages = Math.ceil(totalCount / pageSize);
      const hasNextPage = page < totalPages;
      const hasPreviousPage = page > 1;

      return {
        items,
        page,
        pageSize,
        totalCount,
        totalPages,
        hasNextPage,
        hasPreviousPage,
      };
    }),

  // POST /api/assets/settings - Create asset setting
  createSetting: protectedProcedure
    .input(assetSettingsInputSchema)
    .meta({
      openapi: {
        method: "POST",
        path: "/assets/settings",
        tags: ["Assets"],
        summary: "Create Asset Setting",
        description: "Create a new asset setting. The authenticated user will be recorded as the creator.",
      },
    })
    .output(settingsResponseSchema)
    .mutation(({ ctx, input }) => {
      return prisma.assetSettings.create({
        data: {
          ...input,
          userId: ctx.auth.user.id,
        },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              image: true,
            },
          },
        },
      });
    }),
});
