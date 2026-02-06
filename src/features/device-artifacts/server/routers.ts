import { z } from "zod";
import type { Prisma } from "@/generated/prisma";
import prisma from "@/lib/db";
import {
  createPaginatedResponseSchema,
  paginationInputSchema,
} from "@/lib/pagination";
import {
  cpeToDeviceGroup,
  createArtifactWrappers,
  fetchPaginated,
  transformArtifactWrapper,
} from "@/lib/router-utils";
import {
  artifactInputSchema,
  artifactWrapperSelect,
  artifactWrapperWithUrlsSchema,
  cpeSchema,
  deviceGroupSelect,
  deviceGroupWithUrlsSchema,
  safeUrlSchema,
  userIncludeSelect,
  userSchema,
} from "@/lib/schemas";
import { createTRPCRouter, protectedProcedure } from "@/trpc/init";
import { requireOwnership } from "@/trpc/middleware";

const deviceArtifactInputSchema = z.object({
  cpe: cpeSchema,
  role: z.string().min(1, "Role is required"),
  description: z.string().min(1, "Description is required"),
  upstreamApi: safeUrlSchema.optional(),
  artifacts: z
    .array(artifactInputSchema)
    .min(1, "at least one artifact is required"),
});

const deviceArtifactUpdateSchema = z.object({
  id: z.string(),
  role: z.string().min(1, "Role is required").optional(),
  description: z.string().optional(),
  upstreamApi: safeUrlSchema.optional(),
  cpe: cpeSchema.optional(),
});

const deviceArtifactResponseSchema = z.object({
  id: z.string(),
  role: z.string(),
  upstreamApi: z.string().nullable(),
  description: z.string().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
  user: userSchema,
  deviceGroup: deviceGroupWithUrlsSchema,
  artifacts: z.array(artifactWrapperWithUrlsSchema),
});
export type DeviceArtifactResponse = z.infer<
  typeof deviceArtifactResponseSchema
>;

const paginatedDeviceArtifactResponseSchema = createPaginatedResponseSchema(
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
            artifacts: {
              some: {
                latestArtifact: {
                  OR: [
                    {
                      name: { contains: search, mode: "insensitive" as const },
                    },
                    {
                      downloadUrl: {
                        contains: search,
                        mode: "insensitive" as const,
                      },
                    },
                  ],
                },
              },
            },
          },
        ],
      }
    : {};
};

const deviceArtifactInclude = {
  user: userIncludeSelect,
  deviceGroup: deviceGroupSelect,
  artifacts: artifactWrapperSelect,
};

export const deviceArtifactsRouter = createTRPCRouter({
  // GET /api/deviceArtifacts - List all deviceArtifacts (any authenticated user can see all)
  getMany: protectedProcedure
    .input(paginationInputSchema)
    .meta({
      openapi: {
        method: "GET",
        path: "/deviceArtifacts",
        tags: ["DeviceArtifacts"],
        summary: "List DeviceArtifacts",
        description:
          "Get all deviceArtifacts. Any authenticated user can view all deviceArtifacts.",
      },
    })
    .output(paginatedDeviceArtifactResponseSchema)
    .query(async ({ input }) => {
      const { search } = input;
      const searchFilter = createSearchFilter(search);

      const result = await fetchPaginated(prisma.deviceArtifact, input, {
        where: searchFilter,
        include: deviceArtifactInclude,
      });

      return {
        ...result,
        items: result.items.map(transformArtifactWrapper),
      };
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
        tags: ["DeviceArtifacts", "DeviceGroups"],
        summary: "List DeviceArtifacts by Device Group",
        description:
          "Get all DeviceArtifacts affecting a specific device group. Any authenticated user can view all DeviceArtifacts.",
      },
    })
    .output(paginatedDeviceArtifactResponseSchema)
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

      const result = await fetchPaginated(prisma.deviceArtifact, input, {
        where: whereFilter,
        include: deviceArtifactInclude,
      });

      return {
        ...result,
        items: result.items.map(transformArtifactWrapper),
      };
    }),

  // GET /api/deviceArtifacts/{deviceArtifact_id} - Get single deviceArtifact (any authenticated user can access)
  getOne: protectedProcedure
    .input(z.object({ id: z.string() }))
    .meta({
      openapi: {
        method: "GET",
        path: "/deviceArtifacts/{id}",
        tags: ["DeviceArtifacts"],
        summary: "Get DeviceArtifact",
        description:
          "Get a single DeviceArtifact by ID. Any authenticated user can view any DeviceArtifact.",
      },
    })
    .output(deviceArtifactResponseSchema)
    .query(async ({ input }) => {
      const deviceArtifact = await prisma.deviceArtifact.findUniqueOrThrow({
        where: { id: input.id },
        include: deviceArtifactInclude,
      });
      return transformArtifactWrapper(deviceArtifact);
    }),

  // POST /api/deviceArtifacts - Create deviceArtifact
  create: protectedProcedure
    .input(deviceArtifactInputSchema)
    .meta({
      openapi: {
        method: "POST",
        path: "/deviceArtifacts",
        tags: ["DeviceArtifacts"],
        summary: "Create DeviceArtifact",
        description:
          "Create a new DeviceArtifact. The authenticated user will be recorded as the creator.",
      },
    })
    .output(deviceArtifactResponseSchema)
    .mutation(async ({ ctx, input }) => {
      const deviceGroup = await cpeToDeviceGroup(input.cpe);
      const userId = ctx.auth.user.id;

      // Create device artifact with wrappers and initial artifacts in a transaction
      const result = await prisma.$transaction(async (tx) => {
        // Create the device artifact
        const deviceArtifact = await tx.deviceArtifact.create({
          data: {
            role: input.role,
            description: input.description,
            upstreamApi: input.upstreamApi || null,
            deviceGroupId: deviceGroup.id,
            userId,
          },
        });

        await createArtifactWrappers(
          tx,
          input.artifacts,
          deviceArtifact.id,
          "deviceArtifactId",
          userId,
        );

        // Fetch the complete device artifact with includes
        return tx.deviceArtifact.findUniqueOrThrow({
          where: { id: deviceArtifact.id },
          include: deviceArtifactInclude,
        });
      });

      return transformArtifactWrapper(result);
    }),

  // DELETE /api/deviceArtifacts/{deviceArtifact_id} - Delete deviceArtifact (only creator can delete)
  remove: protectedProcedure
    .input(z.object({ id: z.string() }))
    .meta({
      openapi: {
        method: "DELETE",
        path: "/deviceArtifacts/{id}",
        tags: ["DeviceArtifacts"],
        summary: "Delete DeviceArtifact",
        description:
          "Delete an DeviceArtifact. Only the user who created the DeviceArtifact can delete it.",
      },
    })
    .output(deviceArtifactResponseSchema)
    .mutation(async ({ ctx, input }) => {
      // Verify ownership
      await requireOwnership(input.id, ctx.auth.user.id, "deviceArtifact");

      const deviceArtifact = await prisma.deviceArtifact.delete({
        where: { id: input.id },
        include: deviceArtifactInclude,
      });

      return transformArtifactWrapper(deviceArtifact);
    }),

  // PUT /api/deviceArtifacts/{deviceArtifact_id} - Update deviceArtifact (only creator can update)
  update: protectedProcedure
    .input(deviceArtifactUpdateSchema)
    .meta({
      openapi: {
        method: "PUT",
        path: "/deviceArtifacts/{id}",
        tags: ["DeviceArtifacts"],
        summary: "Update DeviceArtifact",
        description:
          "Update a DeviceArtifact. Only the user who created the DeviceArtifact can update it.",
      },
    })
    .output(deviceArtifactResponseSchema)
    .mutation(async ({ ctx, input }) => {
      // Verify ownership
      await requireOwnership(input.id, ctx.auth.user.id, "deviceArtifact");

      const { id, cpe, ...updateData } = input;

      // Prepare update data
      const data: Prisma.DeviceArtifactUpdateInput = {
        ...(updateData.role !== undefined && { role: updateData.role }),
        ...(updateData.description !== undefined && {
          description: updateData.description,
        }),
        ...(updateData.upstreamApi !== undefined && {
          upstreamApi: updateData.upstreamApi,
        }),
      };

      // Handle CPE/device group update if provided
      if (cpe) {
        const deviceGroup = await cpeToDeviceGroup(cpe);
        data.deviceGroup = { connect: { id: deviceGroup.id } };
      }

      const deviceArtifact = await prisma.deviceArtifact.update({
        where: { id },
        data,
        include: deviceArtifactInclude,
      });

      return transformArtifactWrapper(deviceArtifact);
    }),
});
