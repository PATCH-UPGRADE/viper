import { z } from "zod";
import prisma from "@/lib/db";
import {
  createPaginatedResponseSchema,
  paginationInputSchema,
} from "@/lib/pagination";
import {
  cpesToDeviceGroups,
  fetchPaginated,
  processIntegrationSync,
} from "@/lib/router-utils";
import {
  cpeSchema,
  createIntegrationInputSchema,
  deviceGroupSelect,
  deviceGroupWithUrlsSchema,
  integrationResponseSchema,
  safeUrlSchema,
  userIncludeSelect,
  userSchema,
} from "@/lib/schemas";
import { createTRPCRouter, protectedProcedure } from "@/trpc/init";
import { requireExistence, requireOwnership } from "@/trpc/middleware";

// Validation schemas
const severitySchema = z.enum(["Critical", "High", "Medium", "Low"]);

const vulnerabilityInputSchema = z.object({
  cpes: z.array(cpeSchema).min(1, "At least one CPE is required"),
  sarif: z.any(), // JSON data - Prisma JsonValue type
  cveId: z.string().min(1).optional(),
  description: z.string().min(1).optional(),
  narrative: z.string().min(1).optional(),
  impact: z.string().min(1).optional(),
  severity: severitySchema.optional(),
  cvssScore: z.number().min(0).max(10).optional(),
  cvssVector: z.string().min(1).optional(),
  affectedComponents: z.array(z.string().min(1)).optional(),
  exploitUri: safeUrlSchema.optional(),
  upstreamApi: safeUrlSchema.optional(),
  deviceArtifactId: z.string().min(1).optional(),
});

const vulnerabilityArrayInputSchema = z.object({
  vulnerabilities: z.array(vulnerabilityInputSchema).nonempty(),
});

const vulnerabilityResponseSchema = z.object({
  id: z.string(),
  sarif: z.any(), // JSON data - Prisma JsonValue type
  affectedDeviceGroups: z.array(deviceGroupWithUrlsSchema),
  exploitUri: z.string().nullable(),
  upstreamApi: z.string().nullable(),
  description: z.string().nullable(),
  narrative: z.string().nullable(),
  impact: z.string().nullable(),
  cveId: z.string().nullable(),
  cvssScore: z.number().nullable(),
  severity: severitySchema,
  affectedComponents: z.array(z.string()),
  cvssVector: z.string().nullable(),
  userId: z.string(),
  createdAt: z.date(),
  updatedAt: z.date(),
  user: userSchema,
});

const vulnerabilityArrayResponseSchema = z.array(vulnerabilityResponseSchema);

const paginatedVulnerabilityResponseSchema = createPaginatedResponseSchema(
  vulnerabilityResponseSchema,
);

export const integrationVulnerabilityInputSchema = createIntegrationInputSchema(
  vulnerabilityInputSchema,
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
            include: {
              user: userIncludeSelect,
              affectedDeviceGroups: deviceGroupSelect,
            },
          });
        }),
      );
    }),

  processIntegrationCreate: protectedProcedure
    .input(integrationVulnerabilityInputSchema)
    .meta({
      openapi: {
        method: "POST",
        path: "/vulnerabilities/integrationUpload",
        tags: ["Vulnerabilities"],
        summary: "Synchronize vulnerabilities with integration",
        description:
          "Synchronize vulnerabilities on VIPER from a partnered platform",
      },
    })
    .output(integrationResponseSchema)
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.auth.user.id;
      const foundIntegration = await prisma.integration.findFirstOrThrow({
        // @ts-expect-error ctx.auth.key.id is defined if logging in with api key
        where: { apiKey: { id: ctx.auth.key?.id } },
        select: { id: true },
      });
      const integrationId = foundIntegration.id;

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
});
