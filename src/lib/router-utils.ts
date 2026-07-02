// biome-ignore-all lint/suspicious/noExplicitAny: "any" allows us to reuse prisma client/models accross multiple files
import "server-only";
import { TRPCError } from "@trpc/server";
import {
  type ArtifactType,
  SyncStatusEnum,
  VersionStatus,
  type VersScheme,
} from "@/generated/prisma";
import {
  PrismaClientKnownRequestError,
  PrismaClientValidationError,
} from "@/generated/prisma/runtime/library";
import prisma, { type TransactionClient } from "@/lib/db";
import { requireExistence } from "@/trpc/middleware";
import {
  type DeviceGroupIdentity,
  type MatchingLike,
  matchingAppliesToDeviceGroup,
  matchingWhereForDeviceGroup,
  resolveMatches,
} from "./device-matching";
import {
  buildPaginationMeta,
  createPaginatedResponse,
  type PaginationInput,
} from "./pagination";
import type { IntegrationResponse } from "./schemas";
import { consumeUserToken } from "./tokens";

// ============================================================================
// SORTING
// ============================================================================

/**
 * Build a parser that turns the DataTable's `?sort=` URL param into a Prisma
 * `orderBy` array. The DataTable serializes sorting state as
 * `field` or `-field` (descending), comma-separated for multi-column sort.
 *
 * Unknown fields are silently dropped so callers don't blindly forward user
 * input to Prisma. The default is used when the param is empty OR when every
 * requested field is rejected by the whitelist.
 */
export function createSortParser<Field extends string>(
  allowedFields: ReadonlySet<Field>,
  defaultOrder: Array<Partial<Record<Field, "asc" | "desc">>>,
) {
  return (raw: string): Array<Partial<Record<Field, "asc" | "desc">>> => {
    if (!raw) return defaultOrder;
    const parsed: Array<Partial<Record<Field, "asc" | "desc">>> = [];
    for (const part of raw.split(",")) {
      const desc = part.startsWith("-");
      const field = (desc ? part.slice(1) : part) as Field;
      if (allowedFields.has(field)) {
        parsed.push({ [field]: desc ? "desc" : "asc" } as Partial<
          Record<Field, "asc" | "desc">
        >);
      }
    }
    return parsed.length > 0 ? parsed : defaultOrder;
  };
}

// ============================================================================
// PRISMA TYPES
// ============================================================================

// so we can take in `prisma` into functions and work with it
type PrismaDelegate<T = any> = {
  count: (args?: any) => Promise<number | any>;
  findFirst: (args?: any) => Promise<T | null>;
  findMany: (args?: any) => Promise<T[]>;
  create: (args: any) => Promise<T>;
  update: (args: any) => Promise<T>;
};

interface PrismaClientLike {
  $transaction: (...args: any[]) => Promise<any>;
  syncStatus: Pick<PrismaDelegate, "create">;
}

// ============================================================================
// List / Detail view helpers
// ============================================================================

// ============================================================================
// Canonical Vendor / Product / Version resolution
// ============================================================================

// Normalize a name for canonical lookup (the displayName keeps the original).
export function normalizeName(name: string): string {
  return name.trim().toLowerCase();
}

// A lost create-race surfaces as a P2002 unique violation; the row now exists.
// Duck-typed on `code` rather than `instanceof PrismaClientKnownRequestError`:
// across Next.js module boundaries the thrown error can be a different copy of
// the class, so `instanceof` is unreliable.
function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "P2002"
  );
}

/**
 * Find-or-create the canonical Vendor for a name. Matches an existing row by
 * canonicalName or by membership in its nameMappings (aliases).
 *
 * Canonicals are an idempotent shared registry, so this runs on the autocommit
 * client (never inside the caller's transaction): a concurrent create losing the
 * unique race throws P2002, which would poison an enclosing interactive
 * transaction. Instead we catch P2002 and re-read the winner's row.
 */
export async function resolveVendor(
  name: string,
  opts: { hasCpe?: boolean } = {},
) {
  const canonicalName = normalizeName(name);
  const find = () =>
    prisma.vendor.findFirst({
      where: {
        OR: [{ canonicalName }, { nameMappings: { has: canonicalName } }],
      },
    });
  const existing = await find();
  if (existing) return existing;
  try {
    return await prisma.vendor.create({
      data: {
        canonicalName,
        canonicalDisplayName: name,
        hasCpe: opts.hasCpe ?? false,
      },
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      const row = await find();
      if (row) return row;
    }
    throw error;
  }
}

export async function resolveProduct(
  name: string,
  opts: { hasCpe?: boolean } = {},
) {
  const canonicalName = normalizeName(name);
  const find = () =>
    prisma.product.findFirst({
      where: {
        OR: [{ canonicalName }, { nameMappings: { has: canonicalName } }],
      },
    });
  const existing = await find();
  if (existing) return existing;
  try {
    return await prisma.product.create({
      data: {
        canonicalName,
        canonicalDisplayName: name,
        hasCpe: opts.hasCpe ?? false,
      },
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      const row = await find();
      if (row) return row;
    }
    throw error;
  }
}

export async function resolveVersion(
  name: string,
  opts: { hasCpe?: boolean; versScheme?: VersScheme | null } = {},
) {
  const canonicalName = normalizeName(name);
  const find = () => prisma.version.findFirst({ where: { canonicalName } });
  const existing = await find();
  if (existing) return existing;
  try {
    return await prisma.version.create({
      data: {
        canonicalName,
        canonicalDisplayName: name,
        hasCpe: opts.hasCpe ?? false,
        versScheme: opts.versScheme ?? undefined,
      },
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      const row = await find();
      if (row) return row;
    }
    throw error;
  }
}

export async function addVendorAlias(id: string, alias: string): Promise<void> {
  const normalized = normalizeName(alias);
  const row = await prisma.vendor.findUnique({
    where: { id },
    select: { canonicalName: true, nameMappings: true}
  });

  if(!row) return;
  if(normalized === row.canonicalName || row.nameMappings.includes(normalized)) {
    return;
  }
  await prisma.vendor.update({
    where:{ id },
    data: { nameMappings: { push: normalized }}
  });
};

export async function addProductAlias(id: string, alias: string): Promise<void> {
  const normalized = normalizeName(alias);
  const row = await prisma.product.findUnique({
    where: { id },
    select: { canonicalName: true, nameMappings: true }
  });

  if(!row) return;
  if(normalized === row.canonicalName || row.nameMappings.includes(normalized)) {
    return;
  }
  await prisma.product.update({
    where:{ id },
    data: { nameMappings: { push: normalized }}
  });
};


// ============================================================================
// DeviceGroup resolution
// ============================================================================

export interface DeviceGroupIdentityInput {
  vendor: string;
  product: string;
  version?: string | null;
  versionStatus?: VersionStatus;
  versScheme?: VersScheme | null;
  udi?: string | null;
  /** CPE strings to attach to the group's `cpe` array (unioned). */
  cpes?: string[];
  /** true when this identity is sourced from a CPE (sets hasCpe on canonicals). */
  hasCpe?: boolean;
}

/**
 * Resolve (find-or-create) the DeviceGroup for a vendor/product/version identity,
 * resolving each part to a canonical row first.
 *
 * NOTE: the composite unique on (vendorId, productId, versionId, versionStatus)
 * does not enforce uniqueness when versionId is null (Postgres NULLs are
 * distinct), so we find-then-create and recover from a P2002 create-race when
 * the version is known. Canonicals are resolved on the autocommit client so a
 * lost canonical race never poisons an enclosing transaction.
 */
export async function resolveDeviceGroup(identity: DeviceGroupIdentityInput) {
  const {
    vendor,
    product,
    version = null,
    versionStatus,
    versScheme = null,
    udi,
    cpes = [],
    hasCpe = false,
  } = identity;

  const vendorRow = await resolveVendor(vendor, { hasCpe });
  const productRow = await resolveProduct(product, { hasCpe });
  const versionRow = version
    ? await resolveVersion(version, { hasCpe, versScheme })
    : null;
  const status =
    versionStatus ?? (versionRow ? VersionStatus.KNOWN : VersionStatus.UNKNOWN);

  const where = {
    vendorId: vendorRow.id,
    productId: productRow.id,
    versionId: versionRow?.id ?? null,
    versionStatus: status,
  };
  const find = () => prisma.deviceGroup.findFirst({ where });

  let deviceGroup = await find();
  if (!deviceGroup) {
    try {
      deviceGroup = await prisma.deviceGroup.create({
        data: { ...where, cpe: [...new Set(cpes)], udi: udi ?? undefined },
      });
    } catch (error) {
      if (isUniqueViolation(error)) deviceGroup = await find();
      if (!deviceGroup) throw error;
    }
  }
  // Union any new CPEs / fill in a missing UDI on the existing/created group.
  const mergedCpes = [...new Set([...deviceGroup.cpe, ...cpes])];
  const needsCpe = mergedCpes.length !== deviceGroup.cpe.length;
  const needsUdi = !!udi && !deviceGroup.udi;
  if (needsCpe || needsUdi) {
    deviceGroup = await prisma.deviceGroup.update({
      where: { id: deviceGroup.id },
      data: {
        ...(needsCpe ? { cpe: mergedCpes } : {}),
        ...(needsUdi ? { udi } : {}),
      },
    });
  }

  return deviceGroup;
}

// This is similiar to the above resolveDeviceGroup except it doesn't create. From
// Notification mentioning an identifier isn't evidence the hospital owns the device
// creating one from notification would pollute inventory
export async function enrichDeviceGroupIdentifiers(
    identity: { vendorId: string; productId: string | null; versionId: string | null},
    updates: { cpe?: string | null; udi?: string | null },
  ): Promise<void> {
    const deviceGroup = await prisma.deviceGroup.findFirst({
      where: {
        vendorId: identity.vendorId,
        productId: identity.productId,
        versionId: identity.versionId
      },
    });
    if(!deviceGroup) return;

    const mergedCpes = updates.cpe ? [...new Set([...deviceGroup.cpe, updates.cpe])] : deviceGroup.cpe;
    const needsCpe = mergedCpes.length !== deviceGroup.cpe.length;
    const needsUdi = !!updates.udi && !deviceGroup.udi;
    if (!needsCpe && !needsUdi) return;

    await prisma.deviceGroup.update({
      where: { id: deviceGroup.id },
      data: {
        ...(needsCpe ? { cpe: mergedCpes } : {}),
        ...(needsUdi ? { udi: updates.udi } : {}),
      }
    })
  }

const CPE_UNKNOWN_TOKENS = new Set(["", "-", "*"]);

/**
 * Map a CPE 2.3 version token to a DeviceGroup `versionStatus`:
 * - "-"        => NOT_APPLICABLE (the CPE's NA marker)
 * - "*"/empty  => UNKNOWN        (the CPE's ANY marker / unspecified)
 * - any value  => KNOWN
 */
function cpeVersionStatus(versionRaw: string): VersionStatus {
  if (versionRaw === "-") return VersionStatus.NOT_APPLICABLE;
  if (versionRaw === "" || versionRaw === "*") return VersionStatus.UNKNOWN;
  return VersionStatus.KNOWN;
}

/**
 * Parse a CPE 2.3 string into a vendor/product/version identity.
 * Format: cpe:2.3:<part>:<vendor>:<product>:<version>:...
 * Unknown tokens ("-", "*", empty) map to "-" for vendor/product and null for
 * version; `versionStatus` preserves the NA-vs-ANY distinction for the version.
 */
export function parseCpe(cpe: string): {
  vendor: string;
  product: string;
  version: string | null;
  versionStatus: VersionStatus;
} {
  const parts = cpe.split(":");
  const vendorRaw = parts[3] ?? "-";
  const productRaw = parts[4] ?? "-";
  const versionRaw = parts[5] ?? "";
  const norm = (value: string, fallback: string) =>
    CPE_UNKNOWN_TOKENS.has(value) ? fallback : value;
  return {
    vendor: norm(vendorRaw, "-"),
    product: norm(productRaw, "-"),
    version: CPE_UNKNOWN_TOKENS.has(versionRaw) ? null : versionRaw,
    versionStatus: cpeVersionStatus(versionRaw),
  };
}

/**
 * Resolve a device group from a CPE string: parse it into a vendor/product/
 * version identity, attach the CPE to the group's `cpe` array, and mark the
 * canonical rows as CPE-backed.
 */
export async function cpeToDeviceGroup(cpe: string) {
  const { versionStatus, ...parsed } = parseCpe(cpe);
  return resolveDeviceGroup({
    ...parsed,
    cpes: [cpe],
    hasCpe: true,
    versionStatus,
  });
}

export async function cpesToDeviceGroups(cpes: string[]) {
  const deviceGroups = await Promise.all(
    cpes.map((cpe) => cpeToDeviceGroup(cpe)),
  );
  return deviceGroups;
}

// ============================================================================
// DeviceGroupMatching resolution + matching queries
// ============================================================================

type MatchingResolveInput = {
  vendor: string;
  product?: string | null;
  version?: string | null;
  versionRange?: string | null;
  hasCpe?: boolean;
};

/**
 * Find-or-create a shared DeviceGroupMatching for a vendor/product/version
 * identity (resolved to canonical rows). Identities come from CPEs, so
 * canonicals are marked CPE-backed.
 */
export async function resolveMatchingId(input: MatchingResolveInput): Promise<string> {
  const hasCpe = input.hasCpe ?? true;
  const vendorRow = await resolveVendor(input.vendor, { hasCpe });
  const productRow = input.product
    ? await resolveProduct(input.product, { hasCpe })
    : null;
  const versionRow = input.version
    ? await resolveVersion(input.version, { hasCpe })
    : null;

  const where = {
    vendorId: vendorRow.id,
    productId: productRow?.id ?? null,
    versionId: versionRow?.id ?? null,
    versionRange: input.versionRange ?? null,
  };

  const existing = await prisma.deviceGroupMatching.findFirst({ where });
  if (existing) return existing.id;

  const created = await prisma.deviceGroupMatching.create({ data: where });
  return created.id;
}

/**
 * Resolve a CPE string to a single shared DeviceGroupMatching id (the "identity"
 * of a device artifact — the device it emulates/describes).
 */
export async function resolveMatchingIdFromCpe(cpe: string): Promise<string> {
  const { vendor, product, version } = parseCpe(cpe);
  return resolveMatchingId({ vendor, product, version });
}

/**
 * Resolve a list of CPE strings to shared DeviceGroupMatching rows and return a
 * Prisma `connect` array. This is how the CPE-based upload endpoints
 * connect vulnerabilities/remediations to device groups without exposing the
 * match-object input shape.
 */
export async function cpesToMatchingConnect(cpes: string[]) {
  const ids = await Promise.all(
    [...new Set(cpes)].map(resolveMatchingIdFromCpe),
  );
  return [...new Set(ids)].map((id) => ({ id }));
}

/**
 * Find the vulnerabilities whose matchings apply to any of the given device
 * groups. Naive scan: only matchings sharing the group's vendor (+product or
 * wildcard) are loaded, then confirmed in memory (handles version + VERS ranges).
 */
export async function findVulnerabilitiesMatchingDeviceGroups(
  deviceGroups: DeviceGroupIdentity[],
) {
  const groups = deviceGroups.filter(
    (g): g is DeviceGroupIdentity & { vendorId: string } => g.vendorId !== null,
  );
  if (groups.length === 0) return [];

  const matchings = await prisma.deviceGroupMatching.findMany({
    where: {
      OR: groups.map((g) =>
        matchingWhereForDeviceGroup({
          vendorId: g.vendorId,
          productId: g.productId,
        }),
      ),
    },
    include: { vulnerabilities: true },
  });

  const vulns = new Map<
    string,
    (typeof matchings)[number]["vulnerabilities"][number]
  >();
  for (const matching of matchings) {
    if (resolveMatches([matching], groups).length > 0) {
      for (const vuln of matching.vulnerabilities) vulns.set(vuln.id, vuln);
    }
  }
  return [...vulns.values()];
}

const matchingIdentitySelect = {
  id: true,
  vendorId: true,
  productId: true,
  versionId: true,
  versionRange: true,
  version: { select: { canonicalName: true } },
} as const;

// Whether a matching's identity applies to a device group. Exact/range version
// matching when the group's version is known; for an unknown-version group we
// fall back to vendor (+product) — per the spec's "same vendor/product" rule.
function identityAppliesToGroup(
  matching: MatchingLike,
  group: DeviceGroupIdentity,
): boolean {
  if (matchingAppliesToDeviceGroup(matching, group)) return true;
  if (group.versionId === null && group.vendorId === matching.vendorId) {
    return (
      matching.productId === null || matching.productId === group.productId
    );
  }
  return false;
}

/**
 * Find the ids of DeviceGroupMatchings that apply to the given device group
 * (same vendor/product, with version exact/range, or vendor/product fallback
 * for an unknown-version group). Used to list a group's artifacts and to
 * identify which of an artifact's matchings represent the device itself.
 */
export async function findMatchingIdsForDeviceGroup(
  group: DeviceGroupIdentity,
): Promise<string[]> {
  if (!group.vendorId) return [];
  const candidates = await prisma.deviceGroupMatching.findMany({
    where: matchingWhereForDeviceGroup({
      vendorId: group.vendorId,
      productId: group.productId,
    }),
    select: matchingIdentitySelect,
  });
  return candidates
    .filter((matching) => identityAppliesToGroup(matching, group))
    .map((matching) => matching.id);
}

export async function fetchPaginated<
  TDelegate extends Pick<PrismaDelegate, "count" | "findMany">,
  TArgs extends Parameters<TDelegate["findMany"]>[0],
>(
  delegate: TDelegate,
  input: PaginationInput,
  args: Omit<TArgs, "skip" | "take">,
) {
  const updatedAtFilter: Record<string, Date> = {};
  if (input.lastUpdatedStartTime) {
    updatedAtFilter.gte = new Date(input.lastUpdatedStartTime);
  }
  if (input.lastUpdatedEndTime) {
    updatedAtFilter.lte = new Date(input.lastUpdatedEndTime);
  }

  const where = {
    ...args.where,
    ...(Object.keys(updatedAtFilter).length > 0 && {
      updatedAt: updatedAtFilter,
    }),
  };

  const totalCount = await delegate.count({ where });

  const meta = buildPaginationMeta(input, totalCount);

  const items = await delegate.findMany({
    orderBy: { createdAt: "desc" },
    ...args,
    where,
    skip: meta.skip,
    take: meta.take,
  } as TArgs);

  return createPaginatedResponse(items, meta);
}

// Helper function to transform Prisma result to response format
export const transformArtifactWrapper = (item: any) => {
  return {
    ...item,
    artifacts: item.artifacts
      .map((wrapper: any) => {
        const { _count: _ignoreMe, ...rest } = wrapper;
        return {
          ...rest,
          versionsCount: wrapper._count.artifacts,
        };
      })
      .filter(Boolean),
  };
};

type ArtifactWrapperParentFieldOptions = "deviceArtifactId" | "remediationId";

// Helper function to create ArtifactWrappers
export async function createArtifactWrappers(
  tx: TransactionClient,
  artifacts: Array<{
    name?: string | null;
    artifactType: ArtifactType;
    downloadUrl?: string | null;
    size?: number | null;
    hash?: string | null;
  }>,
  parentId: string,
  parentField: ArtifactWrapperParentFieldOptions,
  userId: string,
): Promise<void> {
  for (const artifactInput of artifacts) {
    // Create artifact wrapper
    const wrapper = await tx.artifactWrapper.create({
      data: {
        [parentField]: parentId,
        userId,
      },
    });

    // Create initial artifact
    const artifact = await tx.artifact.create({
      data: {
        wrapperId: wrapper.id,
        name: artifactInput.name || null,
        artifactType: artifactInput.artifactType,
        downloadUrl: artifactInput.downloadUrl,
        size: artifactInput.size || null,
        hash: artifactInput.hash || null,
        versionNumber: 1,
        userId,
      },
    });

    // Update wrapper to point to this artifact as latest
    await tx.artifactWrapper.update({
      where: { id: wrapper.id },
      data: { latestArtifactId: artifact.id },
    });
  }
}

// ============================================================================
// INTEGRATION SYNC
// ============================================================================

export const handlePrismaError = (e: unknown): string => {
  if (
    e instanceof PrismaClientKnownRequestError ||
    e instanceof PrismaClientValidationError
  ) {
    return e.message;
  }
  return "Internal Server Error";
};

async function upsertSyncStatus(
  integrationId: string,
  response: IntegrationResponse,
  lastSynced: Date,
): Promise<void> {
  // sync-integrations.ts should create PENDING sync status
  // update that if possible
  const latestPending = await prisma.syncStatus.findFirst({
    where: {
      integrationId: integrationId,
      status: SyncStatusEnum.Pending,
    },
    orderBy: {
      syncedAt: "desc", // assuming syncedAt is the timestamp for sorting
    },
  });

  const statusToSet = response.shouldRetry
    ? SyncStatusEnum.Error
    : SyncStatusEnum.Success;
  const errorMessage = response.shouldRetry ? response.message : undefined;

  await prisma.$transaction(async (tx) => {
    await tx.syncStatus.upsert({
      where: {
        id: latestPending?.id || "-1",
      },
      update: {
        status: statusToSet,
        errorMessage,
        syncedAt: lastSynced,
      },
      create: {
        integrationId,
        status: statusToSet,
        errorMessage,
        syncedAt: lastSynced,
      },
    });

    if (statusToSet === SyncStatusEnum.Success) {
      await tx.integration.update({
        where: { id: integrationId },
        data: { lastSuccessfulSync: lastSynced },
      });
    }

    // integrations do not have api keys. update when the request was made here
    await tx.apiKeyConnector.updateMany({
      where: { integrationId },
      data: { lastRequest: lastSynced },
    });
  });
}

interface ArtifactsContent {
  artifacts: Array<{
    name?: string | null;
    artifactType: ArtifactType;
    downloadUrl?: string | null;
    size?: number | null;
    hash?: string | null;
  }>;
  artifactWrapperParentField: ArtifactWrapperParentFieldOptions;
}

/**
 * Configuration for the sync helper
 */
interface SyncConfig<
  TInputItem,
  TCreateData,
  TUpdateData,
  TModel extends { id: string },
  TMappingModel extends { id: string; itemId: string },
> {
  // Prisma model delegates
  model: Pick<PrismaDelegate<TModel>, "findFirst" | "create" | "update">;
  mappingModel: Pick<
    PrismaDelegate<TMappingModel>,
    "findFirst" | "create" | "update"
  >;

  // Transform functions
  transformInputItem: (
    item: TInputItem,
    userId: string,
  ) => Promise<{
    createData: TCreateData;
    updateData: TUpdateData;
    uniqueFieldConditions: Array<Record<string, any>>;
    artifactsData: ArtifactsContent | undefined;
  }>;

  // Optional: Additional fields to include in create
  additionalCreateFields?: (userId: string) => Record<string, any>;
}

/**
 * Helper: return a userId and the associated integration, or throw an error
 * if invalid
 */
export const processIntegrationToken = async (
  token: string,
  expectedPermissions: string,
) => {
  const userId = await consumeUserToken(token, expectedPermissions);
  // TODO: probably need better error messages than this tbh
  if (!userId) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: `Invalid token (couldn't find it, expired, or invalid permissions)`,
    });
  }
  const integration = await prisma.integration.findUnique({
    where: { integrationUserId: userId },
    select: { id: true },
  });
  const integrationId = requireExistence(integration, "Integration").id;
  return { userId, integrationId };
};

/**
 * Generic helper function for processing integration syncs
 */
export async function processIntegrationSync<
  TInputItem extends { vendorId: string },
  TCreateData extends Record<string, any>,
  TUpdateData extends Record<string, any>,
  TModel extends { id: string },
  TMappingModel extends { id: string; itemId: string },
>(
  prisma: PrismaClientLike,
  config: SyncConfig<
    TInputItem,
    TCreateData,
    TUpdateData,
    TModel,
    TMappingModel
  >,
  input: { items: TInputItem[] },
  userId: string,
  integrationId: string,
): Promise<IntegrationResponse> {
  const lastSynced = new Date();

  const response: IntegrationResponse = {
    message: "success",
    createdItemsCount: 0,
    updatedItemsCount: 0,
    shouldRetry: false,
    syncedAt: lastSynced.toISOString(),
  };

  for (const item of input.items) {
    const { vendorId } = item;

    // Look for an existing mapping first
    const foundMapping = await config.mappingModel.findFirst({
      where: {
        integrationId,
        externalId: vendorId,
      },
      select: {
        id: true,
        itemId: true,
      },
    });

    // Transform the input item to get create/update data and unique conditions
    const { createData, updateData, uniqueFieldConditions, artifactsData } =
      await config.transformInputItem(item, userId);

    // If we have a ExternalItemMapping, update the sync time and item
    if (foundMapping) {
      try {
        await prisma.$transaction([
          config.mappingModel.update({
            where: { id: foundMapping.id },
            data: { lastSynced },
          }) as any,
          config.model.update({
            where: { id: (foundMapping as any).itemId },
            data: updateData,
          }) as any,
        ]);
      } catch (error: unknown) {
        response.message = handlePrismaError(error);
        response.shouldRetry = true;
        break;
      }

      response.updatedItemsCount++;
      continue;
    }

    // Try to find existing item by unique identifying properties
    let foundItem: TModel | null = null;
    if (uniqueFieldConditions.length > 0) {
      foundItem = await config.model.findFirst({
        where: { OR: uniqueFieldConditions },
      });
    }

    // If no Item, we need to create the Item and ExternalItemMapping
    if (!foundItem) {
      try {
        const createdItem = await config.model.create({
          data: {
            ...createData,
            ...(config.additionalCreateFields?.(userId) || {}),
            externalMappings: {
              create: {
                integrationId,
                externalId: vendorId,
                lastSynced,
              },
            },
          },
        });

        // Remediation and DeviceArtifacts integrations contain artifacts that need processing
        if (
          artifactsData?.artifacts &&
          artifactsData.artifactWrapperParentField
        ) {
          await prisma.$transaction(async (tx: any) => {
            await createArtifactWrappers(
              tx,
              artifactsData.artifacts,
              createdItem.id,
              artifactsData.artifactWrapperParentField,
              userId,
            );
          });
        }
      } catch (error: unknown) {
        console.error("no existing Item", error);
        response.message = handlePrismaError(error);
        response.shouldRetry = true;
        break;
      }

      response.createdItemsCount++;
      continue;
    }

    // If we have an item but no mapping, create the mapping and update the item
    try {
      await prisma.$transaction([
        config.mappingModel.create({
          data: {
            itemId: foundItem.id,
            integrationId,
            externalId: vendorId,
            lastSynced,
          },
        }),
        config.model.update({
          where: { id: foundItem.id },
          data: updateData,
        }) as any,
      ]);
    } catch (error: unknown) {
      console.error("Item but no mapping", error);
      response.message = handlePrismaError(error);
      response.shouldRetry = true;
      break;
    }

    response.updatedItemsCount++;
  }

  // Create sync status record
  await upsertSyncStatus(integrationId, response, lastSynced);

  return response;
}
