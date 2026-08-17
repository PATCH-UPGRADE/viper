// biome-ignore-all lint/suspicious/noExplicitAny: "any" allows us to reuse prisma client/models accross multiple files
import "server-only";
import {
  type ArtifactType,
  type ResourceType,
  SyncStatusEnum,
} from "@/generated/prisma";
import {
  PrismaClientKnownRequestError,
  PrismaClientValidationError,
} from "@/generated/prisma/runtime/library";
import prisma from "@/lib/db";
import {
  type ArtifactWrapperParentFieldOptions,
  createArtifactWrappers,
} from "@/lib/router-utils";
import type { IntegrationResponse } from "@/lib/schemas";

/**
 * Dedup + upsert data we get in from platforms against the `External*Mapping` tables.
 */

// so we can take in `prisma` into functions and work with it
type PrismaDelegate<T = any> = {
  count: (args?: any) => Promise<number | any>;
  findFirst: (args?: any) => Promise<T | null>;
  findMany: (args?: any) => Promise<T[]>;
  create: (args: any) => Promise<T>;
  update: (args: any) => Promise<T>;
  upsert: (args: any) => Promise<T>;
};

interface PrismaClientLike {
  $transaction: (...args: any[]) => Promise<any>;
  integrationResourceSync: Pick<PrismaDelegate, "upsert">;
}

export const handlePrismaError = (e: unknown): string => {
  if (
    e instanceof PrismaClientKnownRequestError ||
    e instanceof PrismaClientValidationError
  ) {
    return e.message;
  }
  return "Internal Server Error";
};

/**
 * Close out the sync attempt for one (integration, resource).
 */
export async function upsertResourceSync(
  integrationId: string,
  resource: ResourceType,
  response: IntegrationResponse,
  lastSynced: Date,
): Promise<void> {
  const succeeded = !response.shouldRetry;
  const statusToSet = succeeded ? SyncStatusEnum.Success : SyncStatusEnum.Error;
  const errorMessage = succeeded ? null : response.message;

  await prisma.$transaction(async (tx) => {
    await tx.integrationResourceSync.upsert({
      where: { integrationId_resource: { integrationId, resource } },
      update: {
        status: statusToSet,
        errorMessage,
        ...(succeeded
          ? {
              lastSuccessfulSync: lastSynced,
              consecutiveFailures: 0,
              lastSyncCreatedCount: response.createdItemsCount,
            }
          : { consecutiveFailures: { increment: 1 } }),
      },
      create: {
        integrationId,
        resource,
        status: statusToSet,
        errorMessage,
        ...(succeeded
          ? {
              lastSuccessfulSync: lastSynced,
              lastSyncCreatedCount: response.createdItemsCount,
            }
          : { consecutiveFailures: 1 }),
      },
    });

    // integrations do not have api keys. update when the request was made here
    // TODO: VW-435 should probably remove this
    await tx.apiKeyConnector.updateMany({
      where: { integrationId },
      data: { lastRequest: lastSynced },
    });
  });
}

export interface ArtifactsContent {
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
export interface SyncConfig<
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

  // Optional: fired once after a NEW item (and its artifacts) is created, not on
  // re-sync updates. Used e.g. to kick off deviceArtifact note extraction.
  // Hook failures are logged, not propagated, so they never fail the sync.
  onItemCreated?: (itemId: string) => Promise<void>;
}

/**
 * Generic helper function for processing integration syncs
 */
export async function processIntegrationSync<
  TInputItem extends {
    vendorId: string;
    upstreamApi?: string | null;
    webUrl?: string | null;
  },
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
  resource: ResourceType,
): Promise<IntegrationResponse> {
  const lastSynced = new Date();
  const errors: string[] = [];

  const response: IntegrationResponse = {
    message: "success",
    createdItemsCount: 0,
    updatedItemsCount: 0,
    shouldRetry: false,
    syncedAt: lastSynced.toISOString(),
  };

  for (const item of input.items) {
    const { vendorId, upstreamApi = null, webUrl = null } = item;
    const mappingUrls = { upstreamApi, webUrl };

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
            data: { lastSynced, ...mappingUrls },
          }) as any,
          config.model.update({
            where: { id: (foundMapping as any).itemId },
            data: updateData,
          }) as any,
        ]);
      } catch (error: unknown) {
        console.error("mapping + item update failed", { vendorId, error });
        errors.push(handlePrismaError(error));
        continue;
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
      let createdItemId: string | null = null;
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
                ...mappingUrls,
              },
            },
          },
        });
        createdItemId = createdItem.id;

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
        // Note: if the record was created and only the artifact write failed,
        // the item exists and its mapping went in with it, so the next sync
        // takes the update branch. Only the artifacts are missing.
        console.error("no existing Item", { vendorId, error });
        errors.push(handlePrismaError(error));
        continue;
      }

      response.createdItemsCount++;
      if (createdItemId && config.onItemCreated) {
        try {
          await config.onItemCreated(createdItemId);
        } catch (error) {
          console.error("onItemCreated hook failed", error);
        }
      }
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
            ...mappingUrls,
          },
        }),
        config.model.update({
          where: { id: foundItem.id },
          data: updateData,
        }) as any,
      ]);
    } catch (error: unknown) {
      console.error("Item but no mapping", { vendorId, error });
      errors.push(handlePrismaError(error));
      continue;
    }

    response.updatedItemsCount++;
  }

  if (errors.length > 0) {
    // `message` doubles as `IntegrationResourceSync.errorMessage`: the
    // `<N> of <TOTAL>` prefix carries the scale, the first error the symptom.
    response.shouldRetry = true;
    response.message = `${errors.length} of ${input.items.length} items failed: ${errors[0]}`;
  }

  // Close out this (integration, resource) sync attempt
  await upsertResourceSync(integrationId, resource, response, lastSynced);

  return response;
}
