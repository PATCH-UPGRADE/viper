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
import type { TrackedEntityType } from "@/lib/provenance/entities";
import type { IntegrationOrigin } from "@/lib/provenance/types";
import {
  type ArtifactWrapperParentFieldOptions,
  createArtifactWrappers,
} from "@/lib/router-utils";
import type { IntegrationResponse } from "@/lib/schemas";
import {
  type MappingData,
  type SyncStore,
  type TrackedWrite,
  trackedStore,
  type UntrackedTarget,
  type UntrackedWrite,
  untrackedStore,
} from "./stores";

/**
 * Dedup + upsert data we get in from platforms against the `External*Mapping` tables.
 */

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

  await prisma.integrationResourceSync.upsert({
    where: { integrationId_resource: { integrationId, resource } },
    update: {
      status: statusToSet,
      errorMessage,
      ...(succeeded
        ? { lastSuccessfulSync: lastSynced, consecutiveFailures: 0 }
        : { consecutiveFailures: { increment: 1 } }),
    },
    create: {
      integrationId,
      resource,
      status: statusToSet,
      errorMessage,
      ...(succeeded
        ? { lastSuccessfulSync: lastSynced }
        : { consecutiveFailures: 1 }),
    },
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

/** Where a sync's writes come from. */
export interface SyncRun {
  integrationId: string;
  // TODO VW-605 (PR 7): goes, with the shadow users.
  userId: string;
  /** When the sync started or its request arrived, for all of its items. */
  observedAt: Date;
  /** The person who started it. Only a CSV import has one. */
  actorUserId?: string;
}

interface BaseSyncConfig {
  // Optional: fired once after a NEW item (and its artifacts) is created, not on
  // re-sync updates. Used e.g. to kick off deviceArtifact note extraction.
  // Hook failures are logged, not propagated, so they never fail the sync.
  onItemCreated?: (itemId: string) => Promise<void>;

  // false when the caller runs inside the sync worker, whose finalize-sync step
  // already records this attempt on the resource row.
  shouldRecordSyncOutcome?: boolean;
}

/** A sync of a model without provenance, through its delegates. */
export interface UntrackedSyncConfig<TInputItem>
  extends BaseSyncConfig,
    UntrackedTarget {
  entityType?: undefined;
  transformInputItem: (
    item: TInputItem,
    userId: string,
  ) => Promise<
    UntrackedWrite & { artifactsData: ArtifactsContent | undefined }
  >;
}

/** A sync of a tracked model, through the provenance functions. */
export interface TrackedSyncConfig<TInputItem, E extends TrackedEntityType>
  extends BaseSyncConfig {
  entityType: E;
  transformInputItem: (
    item: TInputItem,
    userId: string,
  ) => Promise<TrackedWrite<E>>;
}

export type SyncConfig<TInputItem> =
  | UntrackedSyncConfig<TInputItem>
  | {
      [E in TrackedEntityType]: TrackedSyncConfig<TInputItem, E>;
    }[TrackedEntityType];

interface SyncItem {
  externalId: string;
  upstreamApi?: string | null;
  webUrl?: string | null;
}

/**
 * Generic helper function for processing integration syncs
 */
export async function processIntegrationSync<TInputItem extends SyncItem>(
  config: SyncConfig<TInputItem>,
  input: { items: TInputItem[] },
  run: SyncRun,
  resource: ResourceType,
): Promise<IntegrationResponse> {
  const response =
    config.entityType === undefined
      ? await syncItems(untrackedStore(config), config, input.items, run)
      : await syncItems(
          trackedStore(config.entityType, await integrationOrigin(run)),
          config,
          input.items,
          run,
        );

  if (config.shouldRecordSyncOutcome ?? true) {
    await upsertResourceSync(
      run.integrationId,
      resource,
      response,
      run.observedAt,
    );
  }

  return response;
}

async function integrationOrigin({
  integrationId,
  observedAt,
  actorUserId,
}: SyncRun): Promise<IntegrationOrigin> {
  const { name } = await prisma.integration.findUniqueOrThrow({
    where: { id: integrationId },
    select: { name: true },
  });
  return {
    source: "INTEGRATION",
    integrationId,
    integrationName: name,
    observedAt,
    actorUserId,
  };
}

async function syncItems<TInputItem extends SyncItem, TWrite>(
  store: SyncStore<TWrite>,
  config: BaseSyncConfig & {
    transformInputItem: (
      item: TInputItem,
      userId: string,
    ) => Promise<TWrite & { artifactsData?: ArtifactsContent }>;
  },
  items: TInputItem[],
  { integrationId, userId, observedAt }: SyncRun,
): Promise<IntegrationResponse> {
  const errors: string[] = [];

  const response: IntegrationResponse = {
    message: "success",
    createdItemsCount: 0,
    updatedItemsCount: 0,
    shouldRetry: false,
    syncedAt: observedAt.toISOString(),
  };

  for (const item of items) {
    const { externalId, upstreamApi = null, webUrl = null } = item;
    const mapping: MappingData = {
      integrationId,
      externalId,
      lastSynced: observedAt,
      upstreamApi,
      webUrl,
    };

    // Look for an existing mapping first
    const foundMapping = await store.findMapping(integrationId, externalId);

    // Transform the input item to get create/update data and unique conditions
    const write = await config.transformInputItem(item, userId);

    // If we have a ExternalItemMapping, update the sync time and item
    if (foundMapping) {
      try {
        await store.update(write, foundMapping, mapping);
      } catch (error: unknown) {
        console.error("mapping + item update failed", { externalId, error });
        errors.push(handlePrismaError(error));
        continue;
      }

      response.updatedItemsCount++;
      continue;
    }

    // Try to find existing item by unique identifying properties
    const foundItem = await store.findItem(write);

    // If no Item, we need to create the Item and ExternalItemMapping
    if (!foundItem) {
      let createdItemId: string | null = null;
      try {
        const createdItem = await store.create(write, mapping);
        createdItemId = createdItem.id;

        // Remediation and DeviceArtifacts integrations contain artifacts that need processing
        const { artifactsData } = write;
        if (
          artifactsData?.artifacts &&
          artifactsData.artifactWrapperParentField
        ) {
          await prisma.$transaction(async (tx) => {
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
        console.error("no existing Item", { externalId, error });
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
      await store.link(write, foundItem.id, mapping);
    } catch (error: unknown) {
      console.error("Item but no mapping", { externalId, error });
      errors.push(handlePrismaError(error));
      continue;
    }

    response.updatedItemsCount++;
  }

  if (errors.length > 0) {
    // `message` doubles as `IntegrationResourceSync.errorMessage`: the
    // `<N> of <TOTAL>` prefix carries the scale, the first error the symptom.
    response.shouldRetry = true;
    response.message = `${errors.length} of ${items.length} items failed: ${errors[0]}`;
  }

  return response;
}
