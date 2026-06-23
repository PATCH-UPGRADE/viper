// biome-ignore-all lint/suspicious/noExplicitAny: "any" allows us to reuse prisma client/models accross multiple files
import "server-only";
import { TRPCError } from "@trpc/server";
import { type ArtifactType, SyncStatusEnum } from "@/generated/prisma";
import {
  PrismaClientKnownRequestError,
  PrismaClientValidationError,
} from "@/generated/prisma/runtime/library";
import prisma, { type TransactionClient } from "@/lib/db";
import { requireExistence } from "@/trpc/middleware";
import { matchObjectWhere, resolveMatches } from "./device-matching";
import {
  buildPaginationMeta,
  createPaginatedResponse,
  type PaginationInput,
} from "./pagination";
import type { IntegrationResponse } from "./schemas";
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

export interface DeviceGroupIdentityInput {
  vendor: string;
  product: string;
  version?: string | null;
  gudid?: string | null;
  /** CPE strings to attach to the group (created if not already present). */
  cpes?: string[];
}

/**
 * Resolve (find-or-create) the DeviceGroup identified by a vendor/product/version
 * identity. `version === null` means "unknown version".
 *
 * NOTE: the DB composite unique on (vendor, product, version) does NOT enforce
 * uniqueness when version is null (Postgres treats NULLs as distinct), so we
 * cannot use `upsert`. We find-then-create inside a transaction instead.
 */
export async function resolveDeviceGroup(identity: DeviceGroupIdentityInput) {
  const { vendor, product, version = null, gudid, cpes = [] } = identity;

  return prisma.$transaction(async (tx) => {
    let deviceGroup = await tx.deviceGroup.findFirst({
      where: { vendor, product, version },
    });

    if (!deviceGroup) {
      deviceGroup = await tx.deviceGroup.create({
        data: { vendor, product, version, gudid: gudid ?? undefined },
      });
    } else if (gudid && !deviceGroup.gudid) {
      deviceGroup = await tx.deviceGroup.update({
        where: { id: deviceGroup.id },
        data: { gudid },
      });
    }

    for (const cpe of cpes) {
      await tx.deviceGroupCpe.upsert({
        where: { deviceGroupId_cpe: { deviceGroupId: deviceGroup.id, cpe } },
        update: {},
        create: { deviceGroupId: deviceGroup.id, cpe },
      });
    }

    return deviceGroup;
  });
}

const CPE_UNKNOWN_TOKENS = new Set(["", "-", "*"]);

/**
 * Parse a CPE 2.3 string into a device-group identity.
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
 * Compatibility helper: resolve a device group from a CPE string. The CPE is
 * parsed into a vendor/product/version identity and also attached to the group's
 * CPE list.
 */
export async function cpeToDeviceGroup(cpe: string) {
  return resolveDeviceGroup({ ...parseCpe(cpe), cpes: [cpe] });
}

export async function cpesToDeviceGroups(cpes: string[]) {
  const deviceGroups = await Promise.all(
    cpes.map((cpe) => cpeToDeviceGroup(cpe)),
  );
  return deviceGroups;
}

type MatchObjectLike = {
  vendor: string;
  product?: string | null;
  version?: string | null;
  versionRange?: string | null;
};

/** Normalize match-object inputs into Prisma nested-create rows. */
export function toMatchObjectCreateData(matchObjects: MatchObjectLike[]) {
  return matchObjects.map((mo) => ({
    vendor: mo.vendor,
    product: mo.product ?? null,
    version: mo.version ?? null,
    versionRange: mo.versionRange ?? null,
  }));
}

type DeviceGroupIdentity = {
  id: string;
  vendor: string;
  product: string;
  version: string | null;
};

/**
 * Resolve a set of match objects to the concrete device groups that exist in
 * VIPER, alongside each group's computed match status. Match objects may also
 * reference device groups that don't exist yet — those simply return nothing.
 */
export async function findMatchedDeviceGroups(matchObjects: MatchObjectLike[]) {
  if (matchObjects.length === 0) return [];
  const candidates = await prisma.deviceGroup.findMany({
    where: { OR: matchObjects.map(matchObjectWhere) },
    select: { id: true, vendor: true, product: true, version: true },
  });
  return resolveMatches(matchObjects, candidates);
}

/**
 * Find the vulnerabilities whose match objects apply to any of the given device
 * groups. Narrows candidates by vendor in SQL, then confirms with the in-memory
 * matcher (which also handles product + VERS ranges).
 */
export async function findVulnerabilitiesMatchingDeviceGroups(
  deviceGroups: DeviceGroupIdentity[],
) {
  if (deviceGroups.length === 0) return [];
  const vendors = [...new Set(deviceGroups.map((dg) => dg.vendor))];
  const candidates = await prisma.vulnerability.findMany({
    where: { matchObjects: { some: { vendor: { in: vendors } } } },
    include: { matchObjects: true },
  });
  return candidates.filter(
    (vuln) => resolveMatches(vuln.matchObjects, deviceGroups).length > 0,
  );
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
