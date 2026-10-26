import { z } from "zod";
import {
  attachNote,
  attachNotes,
} from "@/features/notes/server/get-relevant-notes";
import {
  MetricType,
  Priority,
  type Prisma,
  ResourceType,
  Severity,
} from "@/generated/prisma";
import prisma from "@/lib/db";
import {
  type DeviceIdentity,
  deviceIdentitySelect,
} from "@/lib/device-matching";
import {
  buildPaginationMeta,
  createPaginatedResponse,
  type PaginationInput,
  paginationInputSchema,
} from "@/lib/pagination";
import {
  buildUpdatedAtFilter,
  fetchPaginated,
  findVersionIdentity,
  findVulnerabilitiesMatchingDevices,
  processIntegrationToken,
} from "@/lib/router-utils";
import { integrationResponseSchema } from "@/lib/schemas";
import { sortByFields, sortFieldKey } from "@/lib/sort";
import {
  baseProcedure,
  createTRPCRouter,
  protectedProcedure,
} from "@/trpc/init";
import { requireExistence } from "@/trpc/middleware";
import {
  integrationVulnerabilityInputSchema,
  LEGACY_VULNERABILITY_OMIT,
  paginatedVulnerabilityResponseSchema,
  toPrioritizedVulnerability,
  toVulnerabilityResponse,
  vulnerabilitiesByPriorityInputSchema,
  vulnerabilityByPriorityInclude,
  vulnerabilityInclude,
  vulnerabilityResponseSchema,
} from "../types";
import { summarizeRecordMetrics } from "../utils";
import { processVulnerabilityIntegrationSync } from "./integration-sync";

const createSearchFilter = (search: string): Prisma.VulnerabilityWhereInput => {
  const insensitive = { contains: search, mode: "insensitive" as const };
  return search
    ? {
        OR: [
          { displayId: insensitive },
          { identifiers: { some: { value: insensitive } } },
          { description: insensitive },
          { impact: insensitive },
        ],
      }
    : {};
};

export const VULNERABILITY_SORT_FIELDS = new Set([
  "createdAt",
  "updatedAt",
  "priority",
  "severity",
  "description",
  "epss",
  "inKEV",
] as const);

/**
 * Sort keys read from each vulnerability's newest EPSS and KEV metrics. They live on its records,
 * which no Prisma orderBy can reach, so a sort that names one runs in memory.
 */
const METRIC_SORT_KEYS = new Set(["epss", "inKEV"]);

/** The `sort` documentation for the vulnerability lists, shared by OpenAPI and the agent catalog. */
export const VULNERABILITY_SORT_DESCRIPTION = `Comma-separated sort fields, with "-" in front of a field for descending. Fields: ${[...VULNERABILITY_SORT_FIELDS].join(", ")}. severity sorts in enum order, so ascending puts Critical first. epss is the newest EPSS score; "-inKEV" puts vulnerabilities in CISA's KEV catalog first. Rows with no EPSS score, or never checked against KEV, sort last in both directions. Unknown fields are ignored.`;

const vulnerabilityListInputSchema = paginationInputSchema.extend({
  sort: z.string().default("").describe(VULNERABILITY_SORT_DESCRIPTION),
});

function getSortValue(segment: string): "asc" | "desc" {
  return segment.startsWith("-") ? "desc" : "asc";
}

/** The allowed fields of a comma-separated sort string, in order, each with its "-". */
function vulnerabilitySortFields(sort: string): string[] {
  return sort
    .split(",")
    .filter((field) =>
      VULNERABILITY_SORT_FIELDS.has(sortFieldKey(field) as never),
    );
}

/**
 * The Prisma sort clauses for a comma-separated sort string, with unknown fields
 * dropped. EPSS and KEV have no column to sort on; a sort that names them goes
 * through fetchVulnerabilitiesSortedByMetrics instead.
 */
export function vulnerabilitySortClauses(
  sort: string,
): Prisma.VulnerabilityOrderByWithRelationInput[] {
  return vulnerabilitySortFields(sort).flatMap((field) =>
    METRIC_SORT_KEYS.has(sortFieldKey(field))
      ? []
      : [{ [sortFieldKey(field)]: getSortValue(field) }],
  );
}

const sortsByMetric = (sort: string) =>
  vulnerabilitySortFields(sort).some((field) =>
    METRIC_SORT_KEYS.has(sortFieldKey(field)),
  );

/** Position in the enum's declaration order, which is how Postgres sorts an enum column. */
const enumRank = (values: string[], value: string | null) =>
  value === null ? null : values.indexOf(value);

const metricSortSelect = {
  id: true,
  createdAt: true,
  updatedAt: true,
  priority: true,
  severity: true,
  description: true,
  records: {
    select: {
      metrics: { where: { type: { in: [MetricType.EPSS, MetricType.KEV] } } },
    },
  },
} satisfies Prisma.VulnerabilitySelect;

type MetricSortRow = Prisma.VulnerabilityGetPayload<{
  select: typeof metricSortSelect;
}> & { epss: number | null; inKev: number | null };

function metricSortValue(
  row: MetricSortRow,
  key: string,
): number | string | null {
  switch (key) {
    case "epss":
      return row.epss;
    case "inKEV":
      return row.inKev;
    case "priority":
      return enumRank(Object.values(Priority), row.priority);
    case "severity":
      return enumRank(Object.values(Severity), row.severity);
    case "description":
      return row.description;
    case "createdAt":
      return row.createdAt.getTime();
    default:
      return row.updatedAt.getTime();
  }
}

/**
 * One page of vulnerabilities sorted by a field that lives in their metrics (EPSS, KEV). Loads
 * every matching vulnerability's sort fields, sorts them in memory, then loads the page's rows.
 *
 * TODO: if this gets slow, cache the newest EPSS score and KEV flag on Vulnerability (written by
 * upsertFeedRecord, the way refreshVulnerability writes severity) and sort on those columns.
 */
async function fetchVulnerabilitiesSortedByMetrics(
  where: Prisma.VulnerabilityWhereInput,
  input: PaginationInput,
) {
  const rows = await prisma.vulnerability.findMany({
    where: { ...where, ...buildUpdatedAtFilter(input) },
    select: metricSortSelect,
  });
  const meta = buildPaginationMeta(input, rows.length);
  const sorted = sortByFields(
    rows.map((row): MetricSortRow => {
      const { epss, kev } = summarizeRecordMetrics(row.records);
      const inKev = kev?.inKev;
      return {
        ...row,
        epss: epss?.score ?? null,
        inKev: inKev === null || inKev === undefined ? null : Number(inKev),
      };
    }),
    vulnerabilitySortFields(input.sort),
    metricSortValue,
  );

  const pageIds = sorted
    .slice(meta.skip, meta.skip + meta.take)
    .map((row) => row.id);
  const page = await prisma.vulnerability.findMany({
    where: { id: { in: pageIds } },
    include: vulnerabilityInclude,
  });
  const byId = new Map(
    page.map((vulnerability) => [vulnerability.id, vulnerability]),
  );
  return createPaginatedResponse(
    pageIds.flatMap((id) => byId.get(id) ?? []),
    meta,
  );
}

/** One page of vulnerabilities, sorted in SQL or, for EPSS and KEV, in memory. */
async function fetchSortedVulnerabilities(
  where: Prisma.VulnerabilityWhereInput,
  input: PaginationInput,
  defaultOrderBy: Prisma.VulnerabilityOrderByWithRelationInput | undefined,
) {
  if (sortsByMetric(input.sort)) {
    return fetchVulnerabilitiesSortedByMetrics(where, input);
  }
  const sortClauses = vulnerabilitySortClauses(input.sort);
  return fetchPaginated(prisma.vulnerability, input, {
    where,
    include: vulnerabilityInclude,
    ...(sortClauses.length > 0
      ? {
          orderBy: [
            ...sortClauses,
            { updatedAt: "desc" as const },
            { id: "asc" as const },
          ],
        }
      : defaultOrderBy && { orderBy: defaultOrderBy }),
  });
}

/** One page of the vulnerabilities whose matchings apply to a device. */
async function paginateVulnerabilitiesForDevice(
  device: DeviceIdentity,
  input: PaginationInput,
) {
  const matchedVulns = await findVulnerabilitiesMatchingDevices([device]);
  const idFilter = { id: { in: matchedVulns.map((vuln) => vuln.id) } };
  const result = await fetchSortedVulnerabilities(
    input.search
      ? { AND: [createSearchFilter(input.search), idFilter] }
      : idFilter,
    input,
    undefined,
  );
  return {
    ...result,
    items: await attachNotes(
      "VULNERABILITY",
      result.items.map(toVulnerabilityResponse),
    ),
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
      const result = await fetchSortedVulnerabilities(
        createSearchFilter(input.search),
        input,
        { updatedAt: "desc" },
      );

      return {
        ...result,
        items: await attachNotes(
          "VULNERABILITY",
          result.items.map(toVulnerabilityResponse),
        ),
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
      return attachNote("VULNERABILITY", toVulnerabilityResponse(found));
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

  getManyByPriorityInternal: protectedProcedure
    .input(vulnerabilitiesByPriorityInputSchema)
    .query(async ({ input }) => {
      const { priority, ...pagination } = input;
      const { search } = pagination;

      const insensitive = { contains: search, mode: "insensitive" as const };
      const where = {
        priority: priority as Priority,
        ...(search && {
          OR: [
            { identifiers: { some: { value: insensitive } } },
            { description: insensitive },
          ],
        }),
      };

      const result = await fetchPaginated(prisma.vulnerability, pagination, {
        where,
        include: vulnerabilityByPriorityInclude,
        omit: LEGACY_VULNERABILITY_OMIT,
      });
      return {
        ...result,
        items: result.items.map(toPrioritizedVulnerability),
      };
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
