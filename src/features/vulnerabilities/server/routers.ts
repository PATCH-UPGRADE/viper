import { z } from "zod";
import {
  attachNote,
  attachNotes,
} from "@/features/notes/server/get-relevant-notes";
import {
  type AlohaStatus,
  Priority,
  type Prisma,
  ResourceType,
} from "@/generated/prisma";
import prisma from "@/lib/db";
import {
  type DeviceIdentity,
  deviceIdentitySelect,
} from "@/lib/device-matching";
import { type PaginationInput, paginationInputSchema } from "@/lib/pagination";
import {
  devicesToMatchingConnect,
  fetchPaginated,
  findVersionIdentity,
  findVulnerabilitiesMatchingDevices,
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
  vulnerabilityUpdateInputSchema,
} from "../types";
import { processVulnerabilityIntegrationSync } from "./integration-sync";

const createSearchFilter = (search: string) => {
  const insensitive = { contains: search, mode: "insensitive" as const };
  return search
    ? {
        OR: [
          { description: insensitive },
          { impact: insensitive },
          {
            deviceGroupMatchings: {
              some: {
                OR: [
                  { manufacturer: { is: { canonicalName: insensitive } } },
                  { product: { is: { canonicalName: insensitive } } },
                ],
              },
            },
          },
        ],
      }
    : {};
};

export const VULNERABILITY_SORT_FIELDS = new Set([
  "createdAt",
  "updatedAt",
  "priority",
  "severity",
  "epss",
  "cveId",
  "description",
  "inKEV",
] as const);

/** The `sort` documentation for the vulnerability lists, shared by OpenAPI and the agent catalog. */
export const VULNERABILITY_SORT_DESCRIPTION = `Comma-separated sort fields, with "-" in front of a field for descending. Fields: ${[...VULNERABILITY_SORT_FIELDS].join(", ")}. severity sorts in enum order, so ascending puts Critical first. Rows with no EPSS sort last in both directions. Unknown fields are ignored.`;

const vulnerabilityListInputSchema = paginationInputSchema.extend({
  sort: z.string().default("").describe(VULNERABILITY_SORT_DESCRIPTION),
});

function getSortValue(segment: string): "asc" | "desc" {
  return segment.startsWith("-") ? "desc" : "asc";
}

/**
 * The sort clauses for a comma-separated sort string, with unknown fields
 * dropped. EPSS sorts nulls last in both directions: Postgres puts nulls first
 * on a descending sort, so "-epss" would otherwise start with the unscored rows.
 */
export function vulnerabilitySortClauses(
  sort: string,
): Prisma.VulnerabilityOrderByWithRelationInput[] {
  return sort
    .split(",")
    .flatMap<Prisma.VulnerabilityOrderByWithRelationInput>((s) => {
      const field = s.replace("-", "");
      if (!VULNERABILITY_SORT_FIELDS.has(field as never)) return [];
      const direction = getSortValue(s);
      if (field === "epss") {
        return [{ epss: { sort: direction, nulls: "last" } }];
      }
      return [{ [field]: direction }];
    });
}

/** One page of the vulnerabilities whose matchings apply to a device. */
async function paginateVulnerabilitiesForDevice(
  device: DeviceIdentity,
  input: PaginationInput,
) {
  const matchedVulns = await findVulnerabilitiesMatchingDevices([device]);
  const idFilter = { id: { in: matchedVulns.map((vuln) => vuln.id) } };
  const sortClauses = vulnerabilitySortClauses(input.sort);
  const result = await fetchPaginated(prisma.vulnerability, input, {
    where: input.search
      ? { AND: [createSearchFilter(input.search), idFilter] }
      : idFilter,
    include: vulnerabilityInclude,
    ...(sortClauses.length > 0 && {
      orderBy: [
        ...sortClauses,
        { updatedAt: "desc" as const },
        { id: "asc" as const },
      ],
    }),
  });
  return {
    ...result,
    items: await attachNotes("VULNERABILITY", result.items),
  };
}

export const vulnerabilitiesRouter = createTRPCRouter({
  // GET /api/vulnerabilities - List all vulnerabilities (any authenticated user can see all)
  getMany: protectedProcedure
    .input(vulnerabilityListInputSchema)
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
      const sortClauses = vulnerabilitySortClauses(sort);

      const result = await fetchPaginated(prisma.vulnerability, input, {
        where: searchFilter,
        include: vulnerabilityInclude,
        orderBy:
          sortClauses.length > 0
            ? [...sortClauses, { updatedAt: "desc" }, { id: "asc" }]
            : { updatedAt: "desc" },
      });

      return {
        ...result,
        items: await attachNotes("VULNERABILITY", result.items),
      };
    }),

  // GET /api/assets/{id}/vulnerabilities - Vulnerabilities whose matchings
  // apply to an asset's manufacturer, product, and version
  getManyByAsset: protectedProcedure
    .input(vulnerabilityListInputSchema.extend({ id: z.string() }))
    .meta({
      openapi: {
        method: "GET",
        path: "/assets/{id}/vulnerabilities",
        tags: ["Vulnerabilities", "Assets"],
        summary: "List Vulnerabilities by Asset",
        description:
          "Get the vulnerabilities whose matching rules apply to an asset's manufacturer, product, and version.",
      },
    })
    .output(paginatedVulnerabilityResponseSchema)
    .query(async ({ input }) => {
      const asset = await prisma.asset.findUnique({
        where: { id: input.id },
        select: deviceIdentitySelect,
      });
      return paginateVulnerabilitiesForDevice(
        requireExistence(asset, "Asset"),
        input,
      );
    }),

  // GET /api/versions/{id}/vulnerabilities - Vulnerabilities whose matchings
  // apply to one product version
  getManyByVersion: protectedProcedure
    .input(vulnerabilityListInputSchema.extend({ id: z.string() }))
    .meta({
      openapi: {
        method: "GET",
        path: "/versions/{id}/vulnerabilities",
        tags: ["Vulnerabilities", "Versions"],
        summary: "List Vulnerabilities by Version",
        description:
          "Get the vulnerabilities whose matching rules apply to one product version.",
      },
    })
    .output(paginatedVulnerabilityResponseSchema)
    .query(async ({ input }) =>
      paginateVulnerabilitiesForDevice(
        requireExistence(await findVersionIdentity(input.id), "Version"),
        input,
      ),
    ),

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
      const found = requireExistence(vuln, "Vulnerability");
      return attachNote("VULNERABILITY", found);
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
      const { devices, ...dataInput } = input;
      const connect = await devicesToMatchingConnect(devices);

      return prisma.vulnerability.create({
        data: {
          ...dataInput,
          deviceGroupMatchings: { connect },
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
      // resolve shared matchings up-front (each runs its own transaction)
      const connects = await Promise.all(
        input.vulnerabilities.map((vuln) =>
          devicesToMatchingConnect(vuln.devices),
        ),
      );

      // create all vulns in a transaction
      return prisma.$transaction(
        input.vulnerabilities.map((vuln, index) => {
          const { devices: _devices, ...dataInput } = vuln;
          return prisma.vulnerability.create({
            data: {
              ...dataInput,
              deviceGroupMatchings: { connect: connects[index] },
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

      return processVulnerabilityIntegrationSync(input, userId, integrationId);
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
        data: vulnerabilityUpdateInputSchema,
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
      const { devices, ...dataInput } = input.data;

      return prisma.vulnerability.update({
        where: { id: input.id },
        data: {
          ...dataInput,
          ...(devices
            ? {
                deviceGroupMatchings: {
                  set: await devicesToMatchingConnect(devices),
                },
              }
            : {}),
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

      const insensitive = { contains: search, mode: "insensitive" as const };
      const where = {
        priority: priority as Priority,
        ...(search && {
          OR: [{ cveId: insensitive }, { description: insensitive }],
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
