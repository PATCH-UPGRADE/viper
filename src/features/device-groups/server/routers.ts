import { z } from "zod";
import prisma from "@/lib/db";
import {
  createPaginatedResponseSchema,
  paginationInputSchema,
} from "@/lib/pagination";
import { fetchPaginated } from "@/lib/router-utils";
import {
  deviceGroupWithUrlsSchema,
  deviceGroupWithDetailsSchema,
} from "@/lib/schemas";
import { createTRPCRouter, protectedProcedure } from "@/trpc/init";

const deviceGroupResponseSchema = deviceGroupWithUrlsSchema;
const deviceGroupDetailsResponseSchema = deviceGroupWithDetailsSchema;

const paginatedDeviceGroupResponseSchema = createPaginatedResponseSchema(
  deviceGroupResponseSchema,
);

const deviceGroupInputSchema = z.object({
  id: z.string(),
  manufacturer: z.string().optional(),
  modelName: z.string().optional(),
  version: z.string().optional(),
});

const deviceGroupInputHelmIdSchema = z.object({
  id: z.string(),
  helmSbomId: z.string(),
});

export const deviceGroupsRouter = createTRPCRouter({
  // GET /api/deviceGroups - List all device groups (any authenticated user can see all)
  getMany: protectedProcedure
    .input(paginationInputSchema)
    .meta({
      openapi: {
        method: "GET",
        path: "/deviceGroups",
        tags: ["DeviceGroups"],
        summary: "List Device Groups",
        description:
          "Get all Device Groups. Any authenticated user can view all Device Groups.",
      },
    })
    .output(paginatedDeviceGroupResponseSchema)
    .query(async ({ input }) => {
      const { search } = input;

      // Build search filter across multiple fields
      const where = search
        ? {
            OR: [
              { cpe: { contains: search, mode: "insensitive" as const } },
              {
                manufacturer: {
                  contains: search,
                  mode: "insensitive" as const,
                },
              },
              { modelName: { contains: search, mode: "insensitive" as const } },
            ],
          }
        : {};

      return fetchPaginated(prisma.deviceGroup, input, {
        where: where,
      });
    }),

  // GET /api/deviceGroups/{deviceGroupId} - Get single device group (any authenticated user can access)
  getOne: protectedProcedure
    .input(z.object({ id: z.string() }))
    .meta({
      openapi: {
        method: "GET",
        path: "/deviceGroups/{id}",
        tags: ["DeviceGroups"],
        summary: "Get Device Group",
        description:
          "Get a single Device Group by ID. Any authenticated user can view any Device Group.",
      },
    })
    .output(deviceGroupResponseSchema)
    .query(async ({ input }) => {
      return prisma.deviceGroup.findUniqueOrThrow({
        where: { id: input.id },
      });
    }),

  // PUT /api/deviceGroups/{deviceGroupId} - Update DeviceGroup
  update: protectedProcedure
    .input(deviceGroupInputSchema)
    .meta({
      openapi: {
        method: "PUT",
        path: "/deviceGroups/{id}",
        tags: ["DeviceGroups"],
        summary: "Update Device Group",
        description: "Update a device group.",
      },
    })
    .output(deviceGroupDetailsResponseSchema)
    .mutation(async ({ input }) => {
      const { id, ...updateData } = input;
      return prisma.deviceGroup.update({
        where: { id },
        data: updateData,
      });
    }),

  // PUT /api/deviceGroups/{deviceGroupId}/updateHelmId
  updateHelmId: protectedProcedure
    .input(deviceGroupInputHelmIdSchema)
    .meta({
      openapi: {
        method: "PUT",
        path: "/deviceGroups/{id}/updateHelmId",
        tags: ["DeviceGroups"],
        summary: "Update Device Group Helm SBOM ID",
        description:
          "Update only the helmSbomId field on a given Device Group.",
      },
    })
    .output(deviceGroupDetailsResponseSchema)
    .mutation(async ({ input }) => {
      const { id, helmSbomId } = input;
      return prisma.deviceGroup.update({
        where: { id },
        data: {
          helmSbomId: helmSbomId,
        },
      });
    }),
});
