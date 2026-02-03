import { z } from "zod";
import prisma from "@/lib/db";
import {
  createPaginatedResponseSchema,
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

const deviceArtifactInputSchema = z
  .object({
    role: z.string().min(1, "Role is required"),
    cpe: cpeSchema,
    downloadUrl: safeUrlSchema,
    description: z.string().min(1, "Description is required"),
  })

const deviceArtifactUpdateSchema = z
  .object({
    id: z.string(),
    role: z.string().min(1, "Role is required"),
    downloadUrl: safeUrlSchema,
    description: z.string().min(1, "Description is required"),
    cpe: cpeSchema,
  });

const deviceArtifactResponseSchema = z.object({
  id: z.string(),
  role: z.string(),
  downloadUrl: z.string().nullable(),
  dockerUrl: z.string().nullable(),
  description: z.string(),
  userId: z.string(),
  createdAt: z.date(),
  updatedAt: z.date(),
  user: userSchema,
  deviceGroup: deviceGroupWithUrlsSchema,
});

const paginateddeviceArtifactResponseSchema = createPaginatedResponseSchema(
  deviceArtifactResponseSchema,
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

const deviceArtifactInclude = {
  user: userIncludeSelect,
  deviceGroup: deviceGroupSelect,
};

export const deviceArtifactsRouter = createTRPCRouter({
  // GET /api/deviceArtifacts - List all deviceArtifacts (any authenticated user can see all)
  getMany: protectedProcedure
    .input(paginationInputSchema)
    .meta({
      openapi: {
        method: "GET",
        path: "/deviceArtifacts",
        tags: ["deviceArtifacts"],
        summary: "List deviceArtifacts",
        description:
          "Get all deviceArtifacts. Any authenticated user can view all deviceArtifacts.",
      },
    })
    .output(paginateddeviceArtifactResponseSchema)
    .query(async ({ input }) => {
      const { search } = input;

      // Build search filter across multiple fields
      const searchFilter = createSearchFilter(search);

      return fetchPaginated(prisma.deviceArtifact, input, {
        where: searchFilter,
        include: deviceArtifactInclude,
      });
    }),

  // GET /api/deviceGroups/{deviceGroupId}/deviceArtifacts - List deviceArtifacts for a device group
  getManyByDeviceGroup: protectedProcedure
    .input(
      paginationInputSchema.extend({
        deviceGroupId: z.string(),
      }),
    )
    .meta({
      openapi: {
        method: "GET",
        path: "/deviceGroups/{deviceGroupId}/deviceArtifacts",
        tags: ["deviceArtifacts", "DeviceGroups"],
        summary: "List deviceArtifacts by Device Group",
        description:
          "Get all deviceArtifacts affecting a specific device group. Any authenticated user can view all deviceArtifacts.",
      },
    })
    .output(paginateddeviceArtifactResponseSchema)
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
      return fetchPaginated(prisma.deviceArtifact, input, {
        where: whereFilter,
        include: deviceArtifactInclude,
      });
    }),

  // GET /api/deviceArtifacts/{deviceArtifact_id} - Get single deviceArtifact (any authenticated user can access)
  getOne: protectedProcedure
    .input(z.object({ id: z.string() }))
    .meta({
      openapi: {
        method: "GET",
        path: "/deviceArtifacts/{id}",
        tags: ["deviceArtifacts"],
        summary: "Get deviceArtifact",
        description:
          "Get a single deviceArtifact by ID. Any authenticated user can view any deviceArtifact.",
      },
    })
    .output(deviceArtifactResponseSchema)
    .query(async ({ input }) => {
      return prisma.deviceArtifact.findUniqueOrThrow({
        where: { id: input.id },
        include: deviceArtifactInclude,
      });
    }),

  // POST /api/deviceArtifacts - Create deviceArtifact
  create: protectedProcedure
    .input(deviceArtifactInputSchema)
    .meta({
      openapi: {
        method: "POST",
        path: "/deviceArtifacts",
        tags: ["deviceArtifacts"],
        summary: "Create deviceArtifact",
        description:
          "Create a new deviceArtifact. The authenticated user will be recorded as the creator. Exactly one of downloadUrl or dockerUrl must be provided.",
      },
    })
    .output(deviceArtifactResponseSchema)
    .mutation(async ({ ctx, input }) => {
      const deviceGroup = await cpeToDeviceGroup(input.cpe);
      return prisma.deviceArtifact.create({
        data: {
          role: input.role,
          downloadUrl: input.downloadUrl || null,
          dockerUrl: input.dockerUrl || null,
          description: input.description,
          deviceGroupId: deviceGroup.id,
          userId: ctx.auth.user.id,
        },
        include: deviceArtifactInclude,
      });
    }),

  // DELETE /api/deviceArtifacts/{deviceArtifact_id} - Delete deviceArtifact (only creator can delete)
  remove: protectedProcedure
    .input(z.object({ id: z.string() }))
    .meta({
      openapi: {
        method: "DELETE",
        path: "/deviceArtifacts/{id}",
        tags: ["deviceArtifacts"],
        summary: "Delete deviceArtifact",
        description:
          "Delete an deviceArtifact. Only the user who created the deviceArtifact can delete it.",
      },
    })
    .output(deviceArtifactResponseSchema)
    .mutation(async ({ ctx, input }) => {
      // Verify ownership
      await requireOwnership(input.id, ctx.auth.user.id, "deviceArtifact");

      return prisma.deviceArtifact.delete({
        where: { id: input.id },
        include: deviceArtifactInclude,
      });
    }),

  // PUT /api/deviceArtifacts/{deviceArtifact_id} - Update deviceArtifact (only creator can update)
  update: protectedProcedure
    .input(deviceArtifactUpdateSchema)
    .meta({
      openapi: {
        method: "PUT",
        path: "/deviceArtifacts/{id}",
        tags: ["deviceArtifacts"],
        summary: "Update deviceArtifact",
        description:
          "Update an deviceArtifact. Only the user who created the deviceArtifact can update it. Exactly one of downloadUrl or dockerUrl must be provided.",
      },
    })
    .output(deviceArtifactResponseSchema)
    .mutation(async ({ ctx, input }) => {
      // Verify ownership
      await requireOwnership(input.id, ctx.auth.user.id, "deviceArtifact");

      const { id, cpe, ...updateData } = input;
      const deviceGroup = await cpeToDeviceGroup(cpe);
      return prisma.deviceArtifact.update({
        where: { id },
        data: {
          role: updateData.role,
          deviceGroupId: deviceGroup.id,
          downloadUrl: updateData.downloadUrl || null,
          description: updateData.description,
        },
        include: deviceArtifactInclude,
      });
    }),
});
