import { z } from "zod";
import prisma from "@/lib/db";
import {
  createPaginatedResponseSchema,
  paginationInputSchema,
} from "@/lib/pagination";
import { fetchPaginated } from "@/lib/router-utils";
import { deviceGroupWithUrlsSchema } from "@/lib/schemas";
import { createTRPCRouter, protectedProcedure } from "@/trpc/init";

const deviceGroupResponseSchema = deviceGroupWithUrlsSchema;

const paginatedDeviceGroupResponseSchema = createPaginatedResponseSchema(
  deviceGroupResponseSchema,
);

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
          "Get all Device Groups. Any authenticated user can view all assets.",
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
          "Get a single Device Group by ID. Any authenticated user can view any asset.",
      },
    })
    .output(deviceGroupResponseSchema)
    .query(async ({ input }) => {
      return prisma.deviceGroup.findUniqueOrThrow({
        where: { id: input.id },
      });
    }),

  // PUT /api/deviceGroups/{deviceGroupId} - Update DeviceGroup
  // TODO: VW-52

  // PUT /api/deviceGroups/{deviceGroupId}/updateHelmId
  // TODO: VW-52
});
