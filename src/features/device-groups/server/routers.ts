import "server-only";
import { z } from "zod";
import type { Prisma } from "@/generated/prisma";
import prisma from "@/lib/db";
import { fetchSbom } from "@/lib/helm";
import {
  fetchPaginated,
  resolveProduct,
  resolveVendor,
  resolveVersion,
} from "@/lib/router-utils";
import { createTRPCRouter, protectedProcedure } from "@/trpc/init";
import { requireExistence } from "@/trpc/middleware";
import {
  deviceGroupInputSchema,
  deviceGroupWithDetailsSchema,
  deviceGroupWithUrlsSchema,
  helmSbomResponseSchema,
  paginatedDeviceGroupResponseSchema,
  paginationInputWithUpdatedAtFilterFields,
} from "../types";

const deviceGroupResponseSchema = deviceGroupWithUrlsSchema;
const deviceGroupDetailsResponseSchema = deviceGroupWithDetailsSchema;

const canonicalRefInclude = {
  select: { canonicalName: true, canonicalDisplayName: true },
} as const;

const deviceGroupRelationInclude = {
  vendor: canonicalRefInclude,
  product: canonicalRefInclude,
  version: canonicalRefInclude,
} as const;

const deviceGroupInputHelmIdSchema = z.object({
  id: z.string(),
  helmSbomId: z.string(),
});

export const deviceGroupsRouter = createTRPCRouter({
  // GET /api/deviceGroups - List all device groups (any authenticated user can see all)
  getMany: protectedProcedure
    .input(paginationInputWithUpdatedAtFilterFields)
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

      const updatedAt: { gte?: Date; lte?: Date } = {};
      if (input.updatedAtStartTime) {
        updatedAt.gte = input.updatedAtStartTime;
      }

      if (input.updatedAtEndTime) {
        updatedAt.lte = input.updatedAtEndTime;
      }

      // Build search filter across multiple fields
      const insensitive = { contains: search, mode: "insensitive" as const };
      const where = search
        ? {
            OR: [
              { vendor: { is: { canonicalName: insensitive } } },
              { vendor: { is: { canonicalDisplayName: insensitive } } },
              { product: { is: { canonicalName: insensitive } } },
              { product: { is: { canonicalDisplayName: insensitive } } },
              { udi: insensitive },
              { cpe: { has: search } },
            ],
            updatedAt,
          }
        : { updatedAt };

      return fetchPaginated(prisma.deviceGroup, input, {
        where: where,
        include: deviceGroupRelationInclude,
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
      const deviceGroup = await prisma.deviceGroup.findUnique({
        where: { id: input.id },
        include: deviceGroupRelationInclude,
      });
      return requireExistence(deviceGroup, "DeviceGroup");
    }),

  // GET /api/deviceGroups/{helmSbomId}/sbom - Get device group SBOM proxied through Helm
  getDeviceGroupSbom: protectedProcedure
    .input(z.object({ helmSbomId: z.string().min(1) }))
    .meta({
      openapi: {
        method: "GET",
        path: "/deviceGroups/{helmSbomId}/sbom",
        tags: ["DeviceGroups"],
        summary: "Get Device Group SBOM from Helm",
        description:
          "Get a single SBOM via Helm using the helmSbomId. Any authenticated user can pull a Device Group's SBOM.",
      },
    })
    .output(helmSbomResponseSchema)
    .query(async ({ input }) => {
      try {
        const data = await fetchSbom(input.helmSbomId);
        return data;
      } catch (error) {
        console.error("Failed to fetch SBOM: ", error);
        throw error;
      }
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
      const { id, vendor, product, version, versionStatus, udi } = input;
      return prisma.$transaction(async (tx) => {
        const data: Prisma.DeviceGroupUpdateInput = {};
        if (vendor !== undefined) {
          const row = await resolveVendor(tx, vendor);
          data.vendor = { connect: { id: row.id } };
        }
        if (product !== undefined) {
          const row = await resolveProduct(tx, product);
          data.product = { connect: { id: row.id } };
        }
        if (version !== undefined) {
          data.version = version
            ? { connect: { id: (await resolveVersion(tx, version)).id } }
            : { disconnect: true };
        }
        if (versionStatus !== undefined) data.versionStatus = versionStatus;
        if (udi !== undefined) data.udi = udi;

        return tx.deviceGroup.update({
          where: { id },
          data,
          include: deviceGroupRelationInclude,
        });
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
        include: deviceGroupRelationInclude,
      });
    }),
});
