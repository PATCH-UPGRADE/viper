import { z } from "zod";
import prisma from "@/lib/db";
import {
  createPaginatedResponseSchema,
  paginationInputSchema,
} from "@/lib/pagination";
import { cpesToDeviceGroups, fetchPaginated } from "@/lib/router-utils";
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

// Validation schemas
const vulnerabilityInputSchema = z.object({
  sarif: z.any(), // JSON data - Prisma JsonValue type
  cpes: z.array(cpeSchema).min(1, "At least one CPE is required"),
  exploitUri: safeUrlSchema,
  upstreamApi: safeUrlSchema,
  description: z.string().min(1),
  narrative: z.string().min(1),
  impact: z.string().min(1),
});

const vulnerabilityResponseSchema = z.object({
  id: z.string(),
  sarif: z.any(), // JSON data - Prisma JsonValue type
  affectedDeviceGroups: z.array(deviceGroupWithUrlsSchema),
  exploitUri: z.string(),
  upstreamApi: z.string(),
  description: z.string(),
  narrative: z.string(),
  impact: z.string(),
  userId: z.string(),
  createdAt: z.date(),
  updatedAt: z.date(),
  user: userSchema,
});

const paginatedVulnerabilityResponseSchema = createPaginatedResponseSchema(
  vulnerabilityResponseSchema,
);

const vulnerabilityInclude = {
  user: userIncludeSelect,
  affectedDeviceGroups: deviceGroupSelect,
};

const createSearchFilter = (search: string) => {
  return search
    ? {
        OR: [
          {
            description: { contains: search, mode: "insensitive" as const },
          },
          { impact: { contains: search, mode: "insensitive" as const } },
          {
            affectedDeviceGroups: {
              some: {
                cpe: {
                  contains: search,
                  mode: "insensitive" as const,
                },
              },
            },
          },
        ],
      }
    : {};
};

export const vulnerabilitiesRouter = createTRPCRouter({
  // GET /api/vulnerabilities - List all vulnerabilities (any authenticated user can see all)
  getMany: protectedProcedure
    .input(paginationInputSchema)
    .meta({
      openapi: {
        method: "GET",
        path: "/vulnerabilities",
        tags: ["Vulnerabilities"],
        summary: "List Vulnerabilities",
        description:
          "Get all vulnerabilities. Any authenticated user can view all vulnerabilities.",
      },
    })
    .output(paginatedVulnerabilityResponseSchema)
    .query(async ({ input }) => {
      const { search } = input;

      const searchFilter = createSearchFilter(search);
      //return fetchPaginatedVulnerabilities(input, searchFilter);
      return fetchPaginated(prisma.vulnerability, input, {
        where: searchFilter,
        include: vulnerabilityInclude,
      });
    }),

  // GET /api/deviceGroups/{deviceGroupId}/vulnerabilities - List vulnerabilities for a device group
  getManyByDeviceGroup: protectedProcedure
    .input(
      paginationInputSchema.extend({
        deviceGroupId: z.string(),
      }),
    )
    .meta({
      openapi: {
        method: "GET",
        path: "/deviceGroups/{deviceGroupId}/vulnerabilities",
        tags: ["Vulnerabilities", "DeviceGroups"],
        summary: "List Vulnerabilities by Device Group",
        description:
          "Get all vulnerabilities affecting a specific device group. Any authenticated user can view all vulnerabilities.",
      },
    })
    .output(paginatedVulnerabilityResponseSchema)
    .query(async ({ input }) => {
      const { search, deviceGroupId } = input;
      const searchFilter = createSearchFilter(search);
      const whereFilter = search
        ? {
            AND: [
              searchFilter,
              {
                affectedDeviceGroups: {
                  some: {
                    id: deviceGroupId,
                  },
                },
              },
            ],
          }
        : {
            affectedDeviceGroups: {
              some: {
                id: deviceGroupId,
              },
            },
          };
      return fetchPaginated(prisma.vulnerability, input, {
        where: whereFilter,
        include: vulnerabilityInclude,
      });
    }),

  getManyInternal: protectedProcedure
    .input(paginationInputSchema)
    .query(async ({ input }) => {
      const { search, sort } = input;

      const searchFilter = createSearchFilter(search);

      function getSortValue(sort: string) {
        const sortValue = sort.startsWith("-") ? "desc" : "asc";
        if (sort === "issues" || sort === "-issues") {
          return { _count: sortValue };
        }
        return sortValue;
      }

      return fetchPaginated(prisma.vulnerability, input, {
        where: searchFilter,
        include: {
          ...vulnerabilityInclude,
          issues: true,
        },
        orderBy: sort
          ? [
              ...sort.split(",").map((s) => {
                return { [s.replace("-", "")]: getSortValue(s) };
              }),
              { updatedAt: "desc" },
            ]
          : { updatedAt: "desc" },
      });
    }),

  // GET /api/vulnerabilities/{id} - Get single vulnerability (any authenticated user can access)
  getOne: protectedProcedure
    .input(z.object({ id: z.string() }))
    .meta({
      openapi: {
        method: "GET",
        path: "/vulnerabilities/{id}",
        tags: ["Vulnerabilities"],
        summary: "Get Vulnerability",
        description:
          "Get a single vulnerability by ID. Any authenticated user can view any vulnerability.",
      },
    })
    .output(vulnerabilityResponseSchema)
    .query(async ({ input }) => {
      return prisma.vulnerability.findUniqueOrThrow({
        where: { id: input.id },
        include: vulnerabilityInclude,
      });
    }),

  // POST /api/vulnerabilities - Create vulnerability
  create: protectedProcedure
    .input(vulnerabilityInputSchema)
    .meta({
      openapi: {
        method: "POST",
        path: "/vulnerabilities",
        tags: ["Vulnerabilities"],
        summary: "Create Vulnerability",
        description:
          "Create a new vulnerability. The authenticated user will be recorded as the creator.",
      },
    })
    .output(vulnerabilityResponseSchema)
    .mutation(async ({ ctx, input }) => {
      const { cpes, ...dataInput } = input;
      const uniqueCpes = [...new Set(cpes)];
      const deviceGroups = await cpesToDeviceGroups(uniqueCpes);

      const assetIds = [];
      for (const dg of deviceGroups) {
        for (const asset of dg.assets) {
          assetIds.push({ assetId: asset.id });
        }
      }

      return prisma.vulnerability.create({
        data: {
          ...dataInput,
          affectedDeviceGroups: {
            connect: deviceGroups.map((dg) => ({ id: dg.id })),
          },
          issues: {
            create: assetIds,
          },
          userId: ctx.auth.user.id,
        },
        include: { ...vulnerabilityInclude, issues: true },
      });
    }),

  // DELETE /api/vulnerabilities/{id} - Delete vulnerability (only creator can delete)
  remove: protectedProcedure
    .input(z.object({ id: z.string() }))
    .meta({
      openapi: {
        method: "DELETE",
        path: "/vulnerabilities/{id}",
        tags: ["Vulnerabilities"],
        summary: "Delete Vulnerability",
        description:
          "Delete a vulnerability. Only the user who created the vulnerability can delete it.",
      },
    })
    .output(vulnerabilityResponseSchema)
    .mutation(async ({ ctx, input }) => {
      // Verify ownership
      await requireOwnership(input.id, ctx.auth.user.id, "vulnerability");

      return prisma.vulnerability.delete({
        where: { id: input.id },
        include: vulnerabilityInclude,
      });
    }),

  // PUT /api/vulnerabilities/{id} - Update vulnerability (only creator can update)
  update: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        data: vulnerabilityInputSchema,
      }),
    )
    .meta({
      openapi: {
        method: "PUT",
        path: "/vulnerabilities/{id}",
        tags: ["Vulnerabilities"],
        summary: "Update Vulnerability",
        description:
          "Update a vulnerability. Only the user who created the vulnerability can update it.",
      },
    })
    .output(vulnerabilityResponseSchema)
    .mutation(async ({ ctx, input }) => {
      // Verify ownership
      await requireOwnership(input.id, ctx.auth.user.id, "vulnerability");
      const { cpes, ...dataInput } = input.data;
      const deviceGroups = await cpesToDeviceGroups(cpes);

      return prisma.vulnerability.update({
        where: { id: input.id },
        data: {
          ...dataInput,
          affectedDeviceGroups: {
            set: deviceGroups.map((dg) => ({ id: dg.id })),
          },
        },
        include: vulnerabilityInclude,
      });
    }),
});
