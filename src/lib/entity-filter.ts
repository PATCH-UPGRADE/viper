import "server-only";
import { z } from "zod";
import type { Prisma, ScopeTargetModel } from "@/generated/prisma";
import prisma from "@/lib/db";

// ============================================================================
// EntityFilter contract
// ============================================================================
//
// An EntityFilter carries a `filter` JSON value that selects rows of the table
// named by its `targetModel`. To keep authoring safe (filters may be written by
// the UI or an LLM) we do NOT accept raw SQL. Instead `filter` is a *structured*
// Prisma `where` object, validated here against a conservative per-model
// allowlist before it is ever handed to Prisma.
//
// The allowlist intentionally exposes only indexed / cheap-to-filter scalar
// fields (plus a single relation hop where it earns its keep, e.g. Asset ->
// deviceGroup so a note can target "all infusion pumps"). Unknown fields or
// operators are rejected

/** Thrown when a filter is malformed, disallowed, or its query fails. */
export class EntityFilterError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message);
    this.name = "EntityFilterError";
    if (options?.cause !== undefined) this.cause = options.cause;
  }
}

// ----------------------------------------------------------------------------
// Scalar filter primitives — mirror the safe subset of Prisma's field filters.
// Each rejects unknown operators via strictObject.
// ----------------------------------------------------------------------------

const stringFilter = z.union([
  z.string(),
  z.strictObject({
    equals: z.string().optional(),
    not: z.string().optional(),
    in: z.array(z.string()).optional(),
    notIn: z.array(z.string()).optional(),
    contains: z.string().optional(),
    startsWith: z.string().optional(),
    endsWith: z.string().optional(),
    mode: z.enum(["default", "insensitive"]).optional(),
  }),
]);

const numberFilter = z.union([
  z.number(),
  z.strictObject({
    equals: z.number().optional(),
    not: z.number().optional(),
    in: z.array(z.number()).optional(),
    notIn: z.array(z.number()).optional(),
    lt: z.number().optional(),
    lte: z.number().optional(),
    gt: z.number().optional(),
    gte: z.number().optional(),
  }),
]);

const booleanFilter = z.union([
  z.boolean(),
  z.strictObject({
    equals: z.boolean().optional(),
    not: z.boolean().optional(),
  }),
]);

// Dates are carried as ISO-8601 datetime strings in JSON; validate the format
// up front so malformed values fail here rather than at query time.
const dateFilter = z.union([
  z.iso.datetime(),
  z.strictObject({
    equals: z.iso.datetime().optional(),
    lt: z.iso.datetime().optional(),
    lte: z.iso.datetime().optional(),
    gt: z.iso.datetime().optional(),
    gte: z.iso.datetime().optional(),
  }),
]);

const stringListFilter = z.strictObject({
  has: z.string().optional(),
  hasEvery: z.array(z.string()).optional(),
  hasSome: z.array(z.string()).optional(),
  isEmpty: z.boolean().optional(),
});

type FieldMap = Record<string, z.ZodTypeAny>;

/**
 * Build a recursive `where` schema from a scalar field allowlist plus optional
 * single-hop relation sub-schemas. Every field is optional; AND/OR/NOT compose
 * the same schema; unknown keys are rejected.
 */
function buildWhereSchema(
  fields: FieldMap,
  relations: FieldMap = {},
): z.ZodType<Record<string, unknown>> {
  const optional = (map: FieldMap): FieldMap =>
    Object.fromEntries(Object.entries(map).map(([k, v]) => [k, v.optional()]));

  const schema: z.ZodType<Record<string, unknown>> = z.lazy(() =>
    z.strictObject({
      ...optional(fields),
      ...optional(relations),
      AND: z.array(schema).optional(),
      OR: z.array(schema).optional(),
      NOT: z.union([schema, z.array(schema)]).optional(),
    }),
  );
  return schema;
}

// ----------------------------------------------------------------------------
// Per-model allowlists. Enum-valued columns are typed as strings here; Prisma is
// the final arbiter of valid enum members (an invalid value surfaces as an
// EntityFilterError at query time).
// ----------------------------------------------------------------------------

// Single relation hop off Asset: lets a note target e.g. all device groups of a
// vendor/product ("all infusion pumps").
const deviceGroupWhere = buildWhereSchema({
  vendorId: stringFilter,
  productId: stringFilter,
  versionId: stringFilter,
  versionStatus: stringFilter,
  udi: stringFilter,
  helmSbomId: stringFilter,
});

const assetFilterSchema = buildWhereSchema(
  {
    id: stringFilter,
    ip: stringFilter,
    networkSegment: stringFilter,
    role: stringFilter,
    hostname: stringFilter,
    macAddress: stringFilter,
    serialNumber: stringFilter,
    status: stringFilter,
    deviceGroupId: stringFilter,
    createdAt: dateFilter,
    updatedAt: dateFilter,
  },
  { deviceGroup: deviceGroupWhere },
);

const vulnerabilityFilterSchema = buildWhereSchema({
  id: stringFilter,
  cveId: stringFilter,
  severity: stringFilter,
  cvssScore: numberFilter,
  epss: numberFilter,
  inKEV: booleanFilter,
  priority: stringFilter,
  alohaStatus: stringFilter,
  affectedComponents: stringListFilter,
  createdAt: dateFilter,
});

const remediationFilterSchema = buildWhereSchema({
  id: stringFilter,
  vulnerabilityId: stringFilter,
  alohaStatus: stringFilter,
  createdAt: dateFilter,
});

const deviceGroupMatchingFilterSchema = buildWhereSchema({
  id: stringFilter,
  vendorId: stringFilter,
  productId: stringFilter,
  versionId: stringFilter,
  versionRange: stringFilter,
  createdAt: dateFilter,
});

type RegistryEntry = {
  schema: z.ZodType<Record<string, unknown>>;
  query: (where: Record<string, unknown>) => Promise<{ id: string }[]>;
};

/**
 * Maps each ScopeTargetModel to its filter schema and the read-only query that
 * materializes matching ids. `select: { id: true }` keeps the query cheap.
 */
export const TARGET_MODEL_REGISTRY: Record<ScopeTargetModel, RegistryEntry> = {
  ASSET: {
    schema: assetFilterSchema,
    query: (where) =>
      prisma.asset.findMany({
        where: where as Prisma.AssetWhereInput,
        select: { id: true },
      }),
  },
  VULNERABILITY: {
    schema: vulnerabilityFilterSchema,
    query: (where) =>
      prisma.vulnerability.findMany({
        where: where as Prisma.VulnerabilityWhereInput,
        select: { id: true },
      }),
  },
  REMEDIATION: {
    schema: remediationFilterSchema,
    query: (where) =>
      prisma.remediation.findMany({
        where: where as Prisma.RemediationWhereInput,
        select: { id: true },
      }),
  },
  DEVICE_GROUP_MATCHING: {
    schema: deviceGroupMatchingFilterSchema,
    query: (where) =>
      prisma.deviceGroupMatching.findMany({
        where: where as Prisma.DeviceGroupMatchingWhereInput,
        select: { id: true },
      }),
  },
};

/**
 * Validate a filter against its target model's allowlist without running it.
 * Returns the parsed where object on success.
 */
export function validateEntityFilter(
  targetModel: ScopeTargetModel,
  filter: unknown,
):
  | { success: true; data: Record<string, unknown> }
  | {
      success: false;
      error: string;
    } {
  const parsed = TARGET_MODEL_REGISTRY[targetModel].schema.safeParse(filter);
  if (!parsed.success) {
    return { success: false, error: z.prettifyError(parsed.error) };
  }
  return { success: true, data: parsed.data };
}

/**
 * Resolve a filter to the ids of the rows it matches. Throws EntityFilterError
 * only when the filter is malformed, so callers can skip a single bad filter
 * without aborting a batch. Database/query failures propagate unchanged so
 * transient errors can be retried (e.g. by Inngest) rather than swallowed.
 */
export async function resolveEntityFilter(
  targetModel: ScopeTargetModel,
  filter: unknown,
): Promise<string[]> {
  const validation = validateEntityFilter(targetModel, filter);
  if (!validation.success) {
    throw new EntityFilterError(
      `Invalid filter for ${targetModel}: ${validation.error}`,
    );
  }

  const rows = await TARGET_MODEL_REGISTRY[targetModel].query(validation.data);
  return rows.map((row) => row.id);
}
