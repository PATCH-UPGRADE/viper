import { z } from "zod";
import { type AlohaStatus, Priority, ResourceType } from "@/generated/prisma";
import prisma from "@/lib/db";
import { paginationInputSchema } from "@/lib/pagination";
import {
  cpesToDeviceGroups,
  fetchPaginated,
  processIntegrationSync,
  processIntegrationToken,
} from "@/lib/router-utils";
import { alohaInputSchema, integrationResponseSchema } from "@/lib/schemas";
import {
  baseProcedure,
  createTRPCRouter,
  protectedProcedure,
} from "@/trpc/init";
import { requireExistence, requireOwnership } from "@/trpc/middleware";
import {
  integrationVulnerabilityInputSchema,
  paginatedVulnerabilityResponseSchema,
  vulnerabilitiesByPriorityInputSchema,
  vulnerabilityAlohaResponseSchema,
  vulnerabilityArrayInputSchema,
  vulnerabilityArrayResponseSchema,
  vulnerabilityByPriorityInclude,
  vulnerabilityInclude,
  vulnerabilityInputSchema,
  vulnerabilityResponseSchema,
} from "../types";

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

const ALLOWED_SORT_FIELDS = new Set([
  "createdAt",
  "updatedAt",
  "priority",
  "cveId",
  "description",
  "inKEV",
] as const);

function getSortValue(segment: string): "asc" | "desc" {
  return segment.startsWith("-") ? "desc" : "asc";
}

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
      const { search, sort } = input;

      const searchFilter = createSearchFilter(search);

      // TODO: sorting should eventually be moved to fetchPaginated, right?
      const sortClauses = sort
        ? sort.split(",").flatMap((s) => {
            const field = s.replace("-", "");
            if (!ALLOWED_SORT_FIELDS.has(field as never)) return [];
            return [{ [field]: getSortValue(s) }];
          })
        : [];

      return fetchPaginated(prisma.vulnerability, input, {
        where: searchFilter,
        include: vulnerabilityInclude,
        orderBy:
          sortClauses.length > 0
            ? [...sortClauses, { updatedAt: "desc" }]
            : { updatedAt: "desc" },
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
      const vuln = await prisma.vulnerability.findUnique({
        where: { id: input.id },
        include: vulnerabilityInclude,
      });
      return requireExistence(vuln, "Vulnerability");
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

      return prisma.vulnerability.create({
        data: {
          ...dataInput,
          affectedDeviceGroups: {
            connect: deviceGroups.map((dg) => ({ id: dg.id })),
          },
          userId: ctx.auth.user.id,
        },
        include: vulnerabilityInclude,
      });
    }),

  // POST /api/vulnerabilities/bulk - Create one or more vulnerabilities
  createBulk: protectedProcedure
    .input(vulnerabilityArrayInputSchema)
    .meta({
      openapi: {
        method: "POST",
        path: "/vulnerabilities/bulk",
        tags: ["Vulnerabilities"],
        summary: "Create Bulk Vulnerabilities",
        description:
          "Create one or more new vulnerabilities from an array. The authenticated user will be recorded as the creator.",
      },
    })
    .output(vulnerabilityArrayResponseSchema)
    .mutation(async ({ ctx, input }) => {
      // resolve all device groups in parallel
      const deviceGroupPromises = input.vulnerabilities.map(async (vuln) => {
        const { cpes } = vuln;
        const uniqueCpes = [...new Set(cpes)];
        return await cpesToDeviceGroups(uniqueCpes);
      });

      const deviceGroups = await Promise.all(deviceGroupPromises);

      // create all vulns in a transaction
      return prisma.$transaction(
        input.vulnerabilities.map((vuln, index) => {
          const { cpes: _cpes, ...dataInput } = vuln;
          return prisma.vulnerability.create({
            data: {
              ...dataInput,
              affectedDeviceGroups: {
                connect: deviceGroups[index].map((dg) => ({ id: dg.id })),
              },
              userId: ctx.auth.user.id,
            },
            include: vulnerabilityInclude,
          });
        }),
      );
    }),

  processIntegrationCreate: baseProcedure
    .input(integrationVulnerabilityInputSchema)
    .meta({
      openapi: {
        method: "POST",
        path: "/vulnerabilities/integrationUpload/{token}",
        tags: ["Vulnerabilities"],
        summary: "Synchronize Vulnerabilities with integration",
        description:
          "Synchronize Vulnerabilities on VIPER from a partnered platform",
      },
    })
    .output(integrationResponseSchema)
    .mutation(async ({ input }) => {
      // Validate provided token or throw error
      const { userId, integrationId } = await processIntegrationToken(
        input.token,
        ResourceType.Vulnerability,
      );

      return processIntegrationSync(
        prisma,
        {
          model: prisma.vulnerability,
          mappingModel: prisma.externalVulnerabilityMapping,
          transformInputItem: async (item, userId) => {
            const { cpes, vendorId: _vendorId, ...itemData } = item;
            const uniqueCpes = [...new Set(cpes)];
            const deviceGroups = await cpesToDeviceGroups(uniqueCpes);

            return {
              createData: {
                ...itemData,
                userId,
                affectedDeviceGroups: {
                  connect: deviceGroups.map((dg) => ({ id: dg.id })),
                },
              },
              updateData: {
                ...itemData,
                affectedDeviceGroups: {
                  set: deviceGroups.map((dg) => ({ id: dg.id })),
                },
              },
              uniqueFieldConditions: [],
              // ^always create unmapped vulns
              artifactsData: undefined,
              // ^vulnerability integrations do not include artifacts
            };
          },
        },
        input,
        userId,
        integrationId,
      );
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

  // GET /api/vulnerabilities/{id}/aloha - Get aloha data for a vulnerability
  getAloha: protectedProcedure
    .input(z.object({ id: z.string() }))
    .meta({
      openapi: {
        method: "GET",
        path: "/vulnerabilities/{id}/aloha",
        tags: ["Vulnerabilities"],
        summary: "Get Vulnerability Aloha",
        description:
          "Get aloha status and log for a vulnerability. Any authenticated user can access.",
      },
    })
    .output(vulnerabilityAlohaResponseSchema)
    .query(async ({ input }) => {
      const vuln = await prisma.vulnerability.findUnique({
        where: { id: input.id },
        include: vulnerabilityInclude,
      });
      const found = requireExistence(vuln, "Vulnerability");
      return {
        vulnerability: found,
        aloha: { status: found.alohaStatus, log: found.alohaLog },
      };
    }),

  // PUT /api/vulnerabilities/{id}/aloha - Update aloha data for a vulnerability
  updateAloha: protectedProcedure
    .input(z.object({ id: z.string(), data: alohaInputSchema }))
    .meta({
      openapi: {
        method: "PUT",
        path: "/vulnerabilities/{id}/aloha",
        tags: ["Vulnerabilities"],
        summary: "Update Vulnerability Aloha",
        description:
          "Update aloha status and log for a vulnerability. Any authenticated user can update.",
      },
    })
    .output(vulnerabilityAlohaResponseSchema)
    .mutation(async ({ input }) => {
      const existing = await prisma.vulnerability.findUnique({
        where: { id: input.id },
        select: { id: true },
      });
      requireExistence(existing, "Vulnerability");

      const vuln = await prisma.vulnerability.update({
        where: { id: input.id },
        data: {
          alohaStatus: input.data.status as AlohaStatus,
          alohaLog: input.data.log ?? {},
        },
        include: vulnerabilityInclude,
      });
      return {
        vulnerability: vuln,
        aloha: { status: vuln.alohaStatus, log: vuln.alohaLog },
      };
    }),

  getManyByPriorityInternal: protectedProcedure
    .input(vulnerabilitiesByPriorityInputSchema)
    .query(async ({ input }) => {
      const { priority, ...pagination } = input;
      const { search } = pagination;

      const where = {
        priority: priority as Priority,
        ...(search && {
          OR: [
            { cveId: { contains: search, mode: "insensitive" as const } },
            { description: { contains: search, mode: "insensitive" as const } },
          ],
        }),
      };

      return fetchPaginated(prisma.vulnerability, pagination, {
        where,
        include: vulnerabilityByPriorityInclude,
      });
    }),

  getPriorityMetricsInternal: protectedProcedure.query(async () => {
    const [totalCounts, withRemediationCounts] = await Promise.all([
      prisma.vulnerability.groupBy({
        by: ["priority"],
        _count: { priority: true },
      }),
      prisma.vulnerability.groupBy({
        by: ["priority"],
        where: {
          remediations: { some: {} },
        },
        _count: { priority: true },
      }),
    ]);

    const totals = Object.fromEntries(
      totalCounts.map((item) => [item.priority, item._count.priority]),
    );

    const withRemediations = Object.fromEntries(
      withRemediationCounts.map((item) => [
        item.priority,
        item._count.priority,
      ]),
    );

    return Object.values(Priority).reduce(
      (acc, priority) => {
        const key = priority;
        acc[key] = {
          total: totals[key] ?? 0,
          withRemediations: withRemediations[key] ?? 0,
        };
        return acc;
      },
      {} as Record<Priority, { total: number; withRemediations: number }>,
    );
  }),
});
