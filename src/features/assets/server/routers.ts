import prisma from "@/lib/db";
import { createTRPCRouter, protectedProcedure } from "@/trpc/init";
import { TRPCError } from "@trpc/server";
import z from "zod";
import { PAGINATION } from "@/config/constants";
import { userSchema } from "@/lib/schemas";

// Reusable URL validator to prevent javascript: and other dangerous protocols
const safeUrlSchema = z
  .string()
  .url()
  .refine(
    (url) => {
      try {
        const protocol = new URL(url).protocol;
        return protocol === "http:" || protocol === "https:" || protocol === "git:";
      } catch {
        return false;
      }
    },
    { message: "Only http(s) and git URLs allowed" },
  );

// Validation schemas matching the FastAPI spec
const assetInputSchema = z.object({
  ip: z.string().min(1),
  cpe: z.string().regex(/^cpe:2\.3:[^:]+:[^:]+:[^:]+/, "Invalid CPE 2.3 format"),
  role: z.string().min(1),
  upstream_api: safeUrlSchema,
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
  hasToken: z.boolean(),
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
        page: z
          .number()
          .min(PAGINATION.DEFAULT_PAGE)
          .default(PAGINATION.DEFAULT_PAGE),
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
      const { pageSize, search } = input;

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

      // Get total count first to cap page number
      const totalCount = await prisma.asset.count({
        where: searchFilter,
      });

      // Normalize totalPages to at least 1 for better UX
      const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

      // Cap page to prevent expensive queries with very large page numbers
      const page = Math.min(input.page, totalPages);

      const items = await prisma.asset.findMany({
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
      });

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

  // PUT /api/assets/{asset_id} - Update asset (only creator can update)
  update: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        ip: z.string().min(1),
        cpe: z.string().regex(/^cpe:2\.3:[^:]+:[^:]+:[^:]+/, "Invalid CPE 2.3 format"),
        role: z.string().min(1),
        upstream_api: safeUrlSchema,
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
          message: "You can only update assets that you created",
        });
      }

      const { id, ...updateData } = input;
      return prisma.asset.update({
        where: { id },
        data: updateData,
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

  // GET /api/assets/settings - List all asset settings
  getSettings: protectedProcedure
    .input(
      z.object({
        page: z.number().min(PAGINATION.DEFAULT_PAGE).default(PAGINATION.DEFAULT_PAGE),
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
        summary: "Get Asset Manager Settings",
        description: "Get all asset managers that have been set up. Any authenticated user can view all settings.",
      },
    })
    .output(paginatedSettingsResponseSchema)
    .query(async ({ input }) => {
      const { pageSize, search } = input;

      const searchFilter = search
        ? {
            OR: [
              { name: { contains: search, mode: "insensitive" as const } },
              { url: { contains: search, mode: "insensitive" as const } },
            ],
          }
        : {};

      // Get total count first to cap page number
      const totalCount = await prisma.assetSettings.count({
        where: searchFilter,
      });

      // Normalize totalPages to at least 1 for better UX
      const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

      // Cap page to prevent expensive queries with very large page numbers
      const page = Math.min(input.page, totalPages);

      const rawItems = await prisma.assetSettings.findMany({
        skip: (page - 1) * pageSize,
        take: pageSize,
        where: searchFilter,
        select: {
          id: true,
          url: true,
          name: true,
          token: true, // Select to check if exists, but don't return
          userId: true,
          createdAt: true,
          updatedAt: true,
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
      });

      // Map items to exclude token and add hasToken flag
      const items = rawItems.map(({ token, ...item }) => ({
        ...item,
        hasToken: !!token && token.length > 0,
      }));

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

      // Exclude token from response, add hasToken flag
      const { token, ...response } = created;
      return {
        ...response,
        hasToken: !!token && token.length > 0,
      };
    }),
});
