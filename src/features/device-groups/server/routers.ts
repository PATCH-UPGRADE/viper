import { z } from "zod";
import type { DeviceGroup } from "@/generated/prisma";
import prisma from "@/lib/db";
import {
  buildPaginationMeta,
  createPaginatedResponse,
  createPaginatedResponseSchema,
  paginationInputSchema,
} from "@/lib/pagination";
import {
  type DeviceGroupWithUrls,
  deviceGroupWithUrlsSchema,
} from "@/lib/schemas";
import { getBaseUrl } from "@/lib/url-utils";
import { createTRPCRouter, protectedProcedure } from "@/trpc/init";

export const addDeviceGroupUrls = (
  deviceGroup: DeviceGroup,
): DeviceGroupWithUrls => {
  return {
    id: deviceGroup.id,
    cpe: deviceGroup.cpe,
    url: `${getBaseUrl()}/api/v1/deviceGroups/${deviceGroup.id}`,
    sbomUrl: "TODO", // VW-54
    vulnerabilitiesUrl: `${getBaseUrl()}/api/v1/deviceGroups/${deviceGroup.id}/vulnerabilities`,
    emulatorsUrl: `${getBaseUrl()}/api/v1/deviceGroups/${deviceGroup.id}/emulators`,
    assetsUrl: `${getBaseUrl()}/api/v1/deviceGroups/${deviceGroup.id}/assets`,
  };
};

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

      // Get total count and build pagination metadata
      const totalCount = await prisma.deviceGroup.count({ where: where });
      const meta = buildPaginationMeta(input, totalCount);

      // Fetch paginated items
      const items = await prisma.deviceGroup.findMany({
        skip: meta.skip,
        take: meta.take,
        where: where,
        orderBy: { createdAt: "desc" },
      });
      const itemsWithUrls = items.map((item) => addDeviceGroupUrls(item));

      return createPaginatedResponse(itemsWithUrls, meta);
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
      const deviceGroup = await prisma.deviceGroup.findUniqueOrThrow({
        where: { id: input.id },
      });
      return addDeviceGroupUrls(deviceGroup);
    }),

  // PUT /api/deviceGroups/{deviceGroupId} - Update DeviceGroup
  // TODO: VW-52

  // PUT /api/deviceGroups/{deviceGroupId}/updateHelmId
  // TODO: VW-52
});
