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
  computeMatchStatus,
  type DeviceGroupIdentity,
  deviceGroupWhereForMatching,
  type MatchingLike,
  matchingWhereForDeviceGroup,
  resolveMatches,
} from "./device-matching";
import {
  buildPaginationMeta,
  createPaginatedResponse,
  type PaginationInput,
} from "./pagination";
import type { DeviceGroupMatchingInput, IntegrationResponse } from "./schemas";
import { consumeUserToken } from "./tokens";

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
function normalizeName(name: string): string {
  return name.trim().toLowerCase();
}

/**
 * Find-or-create the canonical Vendor for a name. Matches an existing row by
 * canonicalName or by membership in its nameMappings (aliases). Must run inside
 * a transaction.
 */
export async function resolveVendor(
  tx: TransactionClient,
  name: string,
  opts: { hasCpe?: boolean } = {},
) {
  const canonicalName = normalizeName(name);
  const existing = await tx.vendor.findFirst({
    where: {
      OR: [{ canonicalName }, { nameMappings: { has: canonicalName } }],
    },
  });
  if (existing) return existing;
  return tx.vendor.create({
    data: {
      canonicalName,
      canonicalDisplayName: name,
      hasCpe: opts.hasCpe ?? false,
    },
  });
}

export async function resolveProduct(
  tx: TransactionClient,
  name: string,
  opts: { hasCpe?: boolean } = {},
) {
  const canonicalName = normalizeName(name);
  const existing = await tx.product.findFirst({
    where: {
      OR: [{ canonicalName }, { nameMappings: { has: canonicalName } }],
    },
  });
  if (existing) return existing;
  return tx.product.create({
    data: {
      canonicalName,
      canonicalDisplayName: name,
      hasCpe: opts.hasCpe ?? false,
    },
  });
}

export async function resolveVersion(
  tx: TransactionClient,
  name: string,
  opts: { hasCpe?: boolean; versScheme?: VersScheme | null } = {},
) {
  const canonicalName = normalizeName(name);
  const existing = await tx.version.findFirst({ where: { canonicalName } });
  if (existing) return existing;
  return tx.version.create({
    data: {
      canonicalName,
      canonicalDisplayName: name,
      hasCpe: opts.hasCpe ?? false,
      versScheme: opts.versScheme ?? undefined,
    },
  });
}

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
 * distinct), so we find-then-create inside a transaction rather than upsert.
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

  return prisma.$transaction(async (tx) => {
    const vendorRow = await resolveVendor(tx, vendor, { hasCpe });
    const productRow = await resolveProduct(tx, product, { hasCpe });
    const versionRow = version
      ? await resolveVersion(tx, version, { hasCpe, versScheme })
      : null;
    const status =
      versionStatus ??
      (versionRow ? VersionStatus.KNOWN : VersionStatus.UNKNOWN);

    let deviceGroup = await tx.deviceGroup.findFirst({
      where: {
        vendorId: vendorRow.id,
        productId: productRow.id,
        versionId: versionRow?.id ?? null,
        versionStatus: status,
      },
    });

    if (!deviceGroup) {
      deviceGroup = await tx.deviceGroup.create({
        data: {
          vendorId: vendorRow.id,
          productId: productRow.id,
          versionId: versionRow?.id ?? null,
          versionStatus: status,
          cpe: [...new Set(cpes)],
          udi: udi ?? undefined,
        },
      });
    } else {
      const mergedCpes = [...new Set([...deviceGroup.cpe, ...cpes])];
      const needsCpe = mergedCpes.length !== deviceGroup.cpe.length;
      const needsUdi = !!udi && !deviceGroup.udi;
      if (needsCpe || needsUdi) {
        deviceGroup = await tx.deviceGroup.update({
          where: { id: deviceGroup.id },
          data: {
            ...(needsCpe ? { cpe: mergedCpes } : {}),
            ...(needsUdi ? { udi } : {}),
          },
        });
      }
    }

    return deviceGroup;
  });
}

const CPE_UNKNOWN_TOKENS = new Set(["", "-", "*"]);

/**
 * Parse a CPE 2.3 string into a vendor/product/version identity.
 * Format: cpe:2.3:<part>:<vendor>:<product>:<version>:...
 * Unknown tokens ("-", "*", empty) map to "-" for vendor/product and null for
 * version.
 */
export function parseCpe(cpe: string): {
  vendor: string;
  product: string;
  version: string | null;
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
  };
}

/**
 * Resolve a device group from a CPE string: parse it into a vendor/product/
 * version identity, attach the CPE to the group's `cpe` array, and mark the
 * canonical rows as CPE-backed.
 */
export async function cpeToDeviceGroup(cpe: string) {
  const parsed = parseCpe(cpe);
  return resolveDeviceGroup({
    ...parsed,
    cpes: [cpe],
    hasCpe: true,
    versionStatus: parsed.version ? VersionStatus.KNOWN : VersionStatus.UNKNOWN,
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

/**
 * Find-or-create a shared DeviceGroupMatching for a free-text input (vendor/
 * product/version strings resolved to canonical rows). Matchings come from
 * vuln DBs, so canonicals are marked CPE-backed.
 */
async function resolveMatchingId(
  input: DeviceGroupMatchingInput,
): Promise<string> {
  return prisma.$transaction(async (tx) => {
    const vendorRow = await resolveVendor(tx, input.vendor, { hasCpe: true });
    const productRow = input.product
      ? await resolveProduct(tx, input.product, { hasCpe: true })
      : null;
    const versionRow = input.version
      ? await resolveVersion(tx, input.version, { hasCpe: true })
      : null;
    const versionRange = input.versionRange ?? null;

    const existing = await tx.deviceGroupMatching.findFirst({
      where: {
        vendorId: vendorRow.id,
        productId: productRow?.id ?? null,
        versionId: versionRow?.id ?? null,
        versionRange,
      },
    });
    if (existing) return existing.id;

    const created = await tx.deviceGroupMatching.create({
      data: {
        vendorId: vendorRow.id,
        productId: productRow?.id ?? null,
        versionId: versionRow?.id ?? null,
        versionRange,
      },
    });
    return created.id;
  });
}

/**
 * Resolve match inputs to shared DeviceGroupMatching rows and return a Prisma
 * `connect` array for nesting onto a vulnerability.
 */
export async function resolveMatchingConnect(
  inputs: DeviceGroupMatchingInput[],
) {
  const ids = await Promise.all(inputs.map(resolveMatchingId));
  // dedupe ids in case two inputs resolved to the same shared matching
  return [...new Set(ids)].map((id) => ({ id }));
}

/**
 * Resolve a CPE string to a single shared DeviceGroupMatching id (the "identity"
 * of a device artifact — the device it emulates/describes).
 */
export async function resolveMatchingIdFromCpe(cpe: string): Promise<string> {
  const { vendor, product, version } = parseCpe(cpe);
  return resolveMatchingId({ vendor, product, version });
}

const deviceGroupIdentitySelect = {
  id: true,
  vendorId: true,
  productId: true,
  versionId: true,
  version: { select: { canonicalName: true } },
} as const;

/**
 * Resolve a set of matchings to the concrete device groups that exist in VIPER,
 * with each group's computed match status. Matchings may reference device groups
 * that don't exist yet — those simply return nothing.
 */
export async function findMatchedDeviceGroups(matchings: MatchingLike[]) {
  if (matchings.length === 0) return [];
  const candidates = await prisma.deviceGroup.findMany({
    where: { OR: matchings.map(deviceGroupWhereForMatching) },
    select: deviceGroupIdentitySelect,
  });
  return resolveMatches(matchings, candidates);
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
  if (computeMatchStatus(matching, group)) return true;
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

/**
 * Component-level vulnerabilities for a set of device groups. Device artifacts
 * hold a single, undifferentiated set of matchings (the device they're for +
 * their SBOM components). We treat the matchings that apply to the group as the
 * device "identity" and the *remaining* matchings as components, then find
 * vulnerabilities affecting those components.
 */
export async function findComponentVulnerabilitiesForDeviceGroups(
  deviceGroups: DeviceGroupIdentity[],
) {
  const identityMatchingIds = new Set(
    (await Promise.all(deviceGroups.map(findMatchingIdsForDeviceGroup))).flat(),
  );
  if (identityMatchingIds.size === 0) return [];

  const artifacts = await prisma.deviceArtifact.findMany({
    where: {
      deviceGroupMatchings: { some: { id: { in: [...identityMatchingIds] } } },
    },
    select: { deviceGroupMatchings: { select: matchingIdentitySelect } },
  });

  // Component matchings = an artifact's matchings minus the ones that identify
  // the device itself. Treat each as a device identity and reuse the matcher.
  const componentIdentities = [
    ...new Map(
      artifacts
        .flatMap((artifact) => artifact.deviceGroupMatchings)
        .filter((matching) => !identityMatchingIds.has(matching.id))
        .map((component) => [component.id, component]),
    ).values(),
  ];
  return findVulnerabilitiesMatchingDeviceGroups(componentIdentities);
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
