import { z } from "zod";
import prisma from "@/lib/db";
import {
  createPaginatedResponseSchema,
  paginationInputSchema,
} from "@/lib/pagination";
import { cpeToDeviceGroup, fetchPaginated } from "@/lib/router-utils";
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

// Validation schema with XOR constraint: exactly one of downloadUrl OR dockerUrl must be present
const emulatorInputSchema = z
  .object({
    role: z.string().min(1, "Role is required"),
    cpe: cpeSchema,
    downloadUrl: safeUrlSchema.nullable().optional(),
    dockerUrl: safeUrlSchema.nullable().optional(),
    description: z.string().min(1, "Description is required"),
  })
  .refine(
    (data) => {
      const hasDownloadUrl = !!data.downloadUrl;
      const hasDockerUrl = !!data.dockerUrl;
      // XOR: exactly one must be true
      return hasDownloadUrl !== hasDockerUrl;
    },
    {
      message:
        "Exactly one of downloadUrl or dockerUrl must be provided (not both, not neither)",
    },
  );

const emulatorUpdateSchema = z
  .object({
    id: z.string(),
    role: z.string().min(1, "Role is required"),
    downloadUrl: safeUrlSchema.nullable().optional(),
    dockerUrl: safeUrlSchema.nullable().optional(),
    description: z.string().min(1, "Description is required"),
    cpe: cpeSchema,
  })
  .refine(
    (data) => {
      const hasDownloadUrl = !!data.downloadUrl;
      const hasDockerUrl = !!data.dockerUrl;
      // XOR: exactly one must be true
      return hasDownloadUrl !== hasDockerUrl;
    },
    {
      message:
        "Exactly one of downloadUrl or dockerUrl must be provided (not both, not neither)",
    },
  );

const emulatorResponseSchema = z.object({
  id: z.string(),
  role: z.string(),
  downloadUrl: z.string().nullable(),
  dockerUrl: z.string().nullable(),
  description: z.string(),
  userId: z.string(),
  createdAt: z.date(),
  updatedAt: z.date(),
  user: userSchema,
  deviceGroup: deviceGroupSchema,
  helmSbomId: z.string().nullable(),
  // TODO:: ^later, do not use helmSbomId externally (need internal API)
  // i.e, do not put this in an external API that other TA performers might see
});

const paginatedEmulatorResponseSchema = createPaginatedResponseSchema(
  emulatorResponseSchema,
);

// TODO: do something DRY with `createSearchFilter` in other routers
const createSearchFilter = (search: string) => {
  return search
    ? {
        OR: [
          { role: { contains: search, mode: "insensitive" as const } },
          {
            description: { contains: search, mode: "insensitive" as const },
          },
          {
            downloadUrl: { contains: search, mode: "insensitive" as const },
          },
          { dockerUrl: { contains: search, mode: "insensitive" as const } },
        ],
      }
    : {};
};

const emulatorInclude = {
  user: userIncludeSelect,
  deviceGroup: deviceGroupSelect,
};

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
        description:
          "Get all emulators. Any authenticated user can view all emulators.",
      },
    })
    .output(paginatedEmulatorResponseSchema)
    .query(async ({ input }) => {
      const { search } = input;

      // Build search filter across multiple fields
      const searchFilter = createSearchFilter(search);

      return fetchPaginated(prisma.emulator, input, {
        where: searchFilter,
        include: emulatorInclude,
      });
    }),

  // GET /api/deviceGroups/{deviceGroupId}/emulators - List emulators for a device group
  getManyByDeviceGroup: protectedProcedure
    .input(
      paginationInputSchema.extend({
        deviceGroupId: z.string(),
      }),
    )
    .meta({
      openapi: {
        method: "GET",
        path: "/deviceGroups/{deviceGroupId}/emulators",
        tags: ["Emulators", "DeviceGroup"],
        summary: "List Emulators by Device Group",
        description:
          "Get all emulators affecting a specific device group. Any authenticated user can view all emulators.",
      },
    })
    .output(paginatedEmulatorResponseSchema)
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
      return fetchPaginated(prisma.emulator, input, {
        where: whereFilter,
        include: emulatorInclude,
      });
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
        description:
          "Get a single emulator by ID. Any authenticated user can view any emulator.",
      },
    })
    .output(emulatorResponseSchema)
    .query(async ({ input }) => {
      return prisma.emulator.findUniqueOrThrow({
        where: { id: input.id },
        include: emulatorInclude,
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
        description:
          "Create a new emulator. The authenticated user will be recorded as the creator. Exactly one of downloadUrl or dockerUrl must be provided.",
      },
    })
    .output(emulatorResponseSchema)
    .mutation(async ({ ctx, input }) => {
      const deviceGroup = await cpeToDeviceGroup(input.cpe);
      return prisma.emulator.create({
        data: {
          role: input.role,
          downloadUrl: input.downloadUrl || null,
          dockerUrl: input.dockerUrl || null,
          description: input.description,
          deviceGroupId: deviceGroup.id,
          userId: ctx.auth.user.id,
        },
        include: emulatorInclude,
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
        description:
          "Delete an emulator. Only the user who created the emulator can delete it.",
      },
    })
    .output(emulatorResponseSchema)
    .mutation(async ({ ctx, input }) => {
      // Verify ownership
      await requireOwnership(input.id, ctx.auth.user.id, "emulator");

      return prisma.emulator.delete({
        where: { id: input.id },
        include: emulatorInclude,
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
        description:
          "Update an emulator. Only the user who created the emulator can update it. Exactly one of downloadUrl or dockerUrl must be provided.",
      },
    })
    .output(emulatorResponseSchema)
    .mutation(async ({ ctx, input }) => {
      // Verify ownership
      await requireOwnership(input.id, ctx.auth.user.id, "emulator");

      const { id, cpe, ...updateData } = input;
      const deviceGroup = await cpeToDeviceGroup(cpe);
      return prisma.emulator.update({
        where: { id },
        data: {
          role: updateData.role,
          deviceGroupId: deviceGroup.id,
          downloadUrl: updateData.downloadUrl || null,
          dockerUrl: updateData.dockerUrl || null,
          description: updateData.description,
        },
        include: emulatorInclude,
      });
    }),
});
