import prisma from "@/lib/db";
import { createTRPCRouter, protectedProcedure } from "@/trpc/init";
import { TRPCError } from "@trpc/server";
import z from "zod";
import {
  userSchema,
  userIncludeSelect,
  safeUrlSchema,
} from "@/lib/schemas";
import {
  paginationInputSchema,
  buildPaginationMeta,
  createPaginatedResponse,
  createPaginatedResponseSchema,
} from "@/lib/pagination";
import { requireOwnership } from "@/trpc/middleware";

// Validation schema with XOR constraint: exactly one of downloadUrl OR dockerUrl must be present
const emulatorInputSchema = z
  .object({
    role: z.string().min(1, "Role is required"),
    downloadUrl: safeUrlSchema.nullable().optional(),
    dockerUrl: safeUrlSchema.nullable().optional(),
    description: z.string().min(1, "Description is required"),
    assetId: z.string().min(1, "Asset ID is required"),
  })
  .refine(
    (data) => {
      const hasDownloadUrl = !!data.downloadUrl;
      const hasDockerUrl = !!data.dockerUrl;
      // XOR: exactly one must be true
      return hasDownloadUrl !== hasDockerUrl;
    },
    {
      message: "Exactly one of downloadUrl or dockerUrl must be provided (not both, not neither)",
    },
  );

const emulatorUpdateSchema = z
  .object({
    id: z.string(),
    role: z.string().min(1, "Role is required"),
    downloadUrl: safeUrlSchema.nullable().optional(),
    dockerUrl: safeUrlSchema.nullable().optional(),
    description: z.string().min(1, "Description is required"),
    assetId: z.string().min(1, "Asset ID is required"),
  })
  .refine(
    (data) => {
      const hasDownloadUrl = !!data.downloadUrl;
      const hasDockerUrl = !!data.dockerUrl;
      // XOR: exactly one must be true
      return hasDownloadUrl !== hasDockerUrl;
    },
    {
      message: "Exactly one of downloadUrl or dockerUrl must be provided (not both, not neither)",
    },
  );

const emulatorResponseSchema = z.object({
  id: z.string(),
  role: z.string(),
  downloadUrl: z.string().nullable(),
  dockerUrl: z.string().nullable(),
  description: z.string(),
  assetId: z.string(),
  userId: z.string(),
  createdAt: z.date(),
  updatedAt: z.date(),
  user: userSchema,
  asset: z.object({
    id: z.string(),
    ip: z.string(),
    cpe: z.string(),
    role: z.string(),
    upstreamApi: z.string(),
  }),
});

const paginatedEmulatorResponseSchema = createPaginatedResponseSchema(emulatorResponseSchema);

export const emulatorsRouter = createTRPCRouter({
  // GET /api/emulators - List all emulators (any authenticated user can see all)
  getMany: protectedProcedure
    .input(paginationInputSchema)
    .meta({
      openapi: {
        method: "GET",
        path: "/emulators",
        tags: ["Emulators"],
        summary: "List Emulators",
        description: "Get all emulators. Any authenticated user can view all emulators.",
      },
    })
    .output(paginatedEmulatorResponseSchema)
    .query(async ({ input }) => {
      const { search } = input;

      // Build search filter across multiple fields
      const searchFilter = search
        ? {
            OR: [
              { role: { contains: search, mode: "insensitive" as const } },
              { description: { contains: search, mode: "insensitive" as const } },
              { downloadUrl: { contains: search, mode: "insensitive" as const } },
              { dockerUrl: { contains: search, mode: "insensitive" as const } },
            ],
          }
        : {};

      // Get total count and build pagination metadata
      const totalCount = await prisma.emulator.count({ where: searchFilter });
      const meta = buildPaginationMeta(input, totalCount);

      // Fetch paginated items
      const items = await prisma.emulator.findMany({
        skip: meta.skip,
        take: meta.take,
        where: searchFilter,
        include: {
          user: userIncludeSelect,
          asset: {
            select: {
              id: true,
              ip: true,
              cpe: true,
              role: true,
              upstreamApi: true,
            },
          },
        },
        orderBy: { createdAt: "desc" },
      });

      return createPaginatedResponse(items, meta);
    }),

  // GET /api/emulators/{emulator_id} - Get single emulator (any authenticated user can access)
  getOne: protectedProcedure
    .input(z.object({ id: z.string() }))
    .meta({
      openapi: {
        method: "GET",
        path: "/emulators/{id}",
        tags: ["Emulators"],
        summary: "Get Emulator",
        description: "Get a single emulator by ID. Any authenticated user can view any emulator.",
      },
    })
    .output(emulatorResponseSchema)
    .query(async ({ input }) => {
      return prisma.emulator.findUniqueOrThrow({
        where: { id: input.id },
        include: {
          user: userIncludeSelect,
          asset: {
            select: {
              id: true,
              ip: true,
              cpe: true,
              role: true,
              upstreamApi: true,
            },
          },
        },
      });
    }),

  // POST /api/emulators - Create emulator
  create: protectedProcedure
    .input(emulatorInputSchema)
    .meta({
      openapi: {
        method: "POST",
        path: "/emulators",
        tags: ["Emulators"],
        summary: "Create Emulator",
        description: "Create a new emulator. The authenticated user will be recorded as the creator. Exactly one of downloadUrl or dockerUrl must be provided.",
      },
    })
    .output(emulatorResponseSchema)
    .mutation(({ ctx, input }) => {
      return prisma.emulator.create({
        data: {
          role: input.role,
          downloadUrl: input.downloadUrl || null,
          dockerUrl: input.dockerUrl || null,
          description: input.description,
          assetId: input.assetId,
          userId: ctx.auth.user.id,
        },
        include: {
          user: userIncludeSelect,
          asset: {
            select: {
              id: true,
              ip: true,
              cpe: true,
              role: true,
              upstreamApi: true,
            },
          },
        },
      });
    }),

  // DELETE /api/emulators/{emulator_id} - Delete emulator (only creator can delete)
  remove: protectedProcedure
    .input(z.object({ id: z.string() }))
    .meta({
      openapi: {
        method: "DELETE",
        path: "/emulators/{id}",
        tags: ["Emulators"],
        summary: "Delete Emulator",
        description: "Delete an emulator. Only the user who created the emulator can delete it.",
      },
    })
    .output(emulatorResponseSchema)
    .mutation(async ({ ctx, input }) => {
      // Verify ownership
      await requireOwnership(input.id, ctx.auth.user.id, "emulator");

      return prisma.emulator.delete({
        where: { id: input.id },
        include: {
          user: userIncludeSelect,
          asset: {
            select: {
              id: true,
              ip: true,
              cpe: true,
              role: true,
              upstreamApi: true,
            },
          },
        },
      });
    }),

  // PUT /api/emulators/{emulator_id} - Update emulator (only creator can update)
  update: protectedProcedure
    .input(emulatorUpdateSchema)
    .meta({
      openapi: {
        method: "PUT",
        path: "/emulators/{id}",
        tags: ["Emulators"],
        summary: "Update Emulator",
        description: "Update an emulator. Only the user who created the emulator can update it. Exactly one of downloadUrl or dockerUrl must be provided.",
      },
    })
    .output(emulatorResponseSchema)
    .mutation(async ({ ctx, input }) => {
      // Verify ownership
      await requireOwnership(input.id, ctx.auth.user.id, "emulator");

      const { id, ...updateData } = input;
      return prisma.emulator.update({
        where: { id },
        data: {
          role: updateData.role,
          downloadUrl: updateData.downloadUrl || null,
          dockerUrl: updateData.dockerUrl || null,
          description: updateData.description,
          assetId: updateData.assetId,
        },
        include: {
          user: userIncludeSelect,
          asset: {
            select: {
              id: true,
              ip: true,
              cpe: true,
              role: true,
              upstreamApi: true,
            },
          },
        },
      });
    }),
});
