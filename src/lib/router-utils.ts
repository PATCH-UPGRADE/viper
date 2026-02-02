// biome-ignore-all lint/suspicious/noExplicitAny: "any" allows us to reuse prisma client/models accross multiple files
import "server-only";
import { SyncStatusEnum } from "@/generated/prisma";
import {
  PrismaClientKnownRequestError,
  PrismaClientValidationError,
} from "@/generated/prisma/runtime/library";
import prisma from "@/lib/db";
import {
  buildPaginationMeta,
  createPaginatedResponse,
  type PaginationInput,
} from "./pagination";
import type { IntegrationResponseType } from "./schemas";

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

export async function cpeToDeviceGroup(cpe: string) {
  // requires: cpe is properly formatted according to cpeSchema
  // outputs: the DeviceGroup model instance that `cpe` specifies (creates a new one if none exist)

  // TODO: VW-38 create a cpe naming table here to standardize input
  // when creating a new device group, also populate Manufacturer, model name, version fields
  return prisma.deviceGroup.upsert({
    where: { cpe },
    update: {},
    create: { cpe },
    include: { assets: true },
  });
}

export async function cpesToDeviceGroups(cpes: string[]) {
  const deviceGroups = await Promise.all(
    cpes.map((cpe) => cpeToDeviceGroup(cpe)),
  );
  return deviceGroups;
}
export async function fetchPaginated<
  TDelegate extends Pick<PrismaDelegate, "count" | "findMany">,
  TArgs extends Parameters<TDelegate["findMany"]>[0],
>(
  delegate: TDelegate,
  input: PaginationInput,
  args: Omit<TArgs, "skip" | "take">,
) {
  const totalCount = await delegate.count({
    where: args.where,
  });

  const meta = buildPaginationMeta(input, totalCount);

  const items = await delegate.findMany({
    orderBy: { createdAt: "desc" },
    ...args,
    skip: meta.skip,
    take: meta.take,
  } as TArgs);

  return createPaginatedResponse(items, meta);
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
  response: IntegrationResponseType,
  lastSynced: Date,
): Promise<void> {
  // sync-integrations.ts shoudl create PENDING sync status
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

  await prisma.syncStatus.upsert({
    where: {
      id: latestPending?.id || "-1",
      // ^Use a non-existent ID to trigger creation if no Pending status found
    },
    update: {
      status: statusToSet,
      errorMessage: errorMessage,
      syncedAt: lastSynced,
    },
    create: {
      integrationId,
      status: statusToSet,
      errorMessage: errorMessage,
      syncedAt: lastSynced,
    },
  });
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
  }>;

  // Optional: Additional fields to include in create
  additionalCreateFields?: (userId: string) => Record<string, any>;
}

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
): Promise<IntegrationResponseType> {
  const lastSynced = new Date();

  const response: IntegrationResponseType = {
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
    const { createData, updateData, uniqueFieldConditions } =
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
        await config.model.create({
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
