import "server-only";
import { processIntegrationSync } from "@/features/integrations/core/sync/upsert";
import { ResourceType } from "@/generated/prisma";
import prisma from "@/lib/db";
import { resolveDeviceGroup } from "@/lib/router-utils";
import type { IntegrationResponse } from "@/lib/schemas";
import type { ResourceSyncCtx, SyncOutcome } from "../../../core/types";
import {
  type FleetConfig,
  type FleetCreds,
  SIEMENS_HEALTHINEERS,
} from "../config";
import { createFleetSession } from "../session";
import {
  computeWeakSerials,
  type FleetAssetItem,
  listChanged,
  toCanonical,
} from "./index";
import { connectManagedAssets } from "./manages-relationship";

async function equipmentKeysWeMayRegroup(
  integrationId: string,
): Promise<Set<string>> {
  const mappingsToNameDerivedGroups =
    await prisma.externalAssetMapping.findMany({
      where: {
        integrationId,
        item: { deviceGroup: { cpe: { isEmpty: true } } },
      },
      select: { externalId: true },
    });
  return new Set(mappingsToNameDerivedGroups.map((m) => m.externalId));
}

async function ingestFleetAssets(
  items: FleetAssetItem[],
  integrationId: string,
): Promise<IntegrationResponse> {
  const { integrationUserId } = await prisma.integration.findUniqueOrThrow({
    where: { id: integrationId },
    select: { integrationUserId: true },
  });
  const weakSerials = computeWeakSerials(items);
  const regroupableEquipmentKeys =
    await equipmentKeysWeMayRegroup(integrationId);

  const assetsAlreadyMapped = await prisma.asset.findMany({
    where: {
      externalMappings: { some: { integrationId } },
      serialNumber: { not: null },
    },
    select: { serialNumber: true },
  });
  // Fleet could show multiple unique devices (could be parts of 1 device) shares same serial
  // add to weakSerials to create new assets still
  for (const asset of assetsAlreadyMapped) {
    if (asset.serialNumber) {
      weakSerials.add(asset.serialNumber);
    }
  }

  return processIntegrationSync(
    prisma,
    {
      model: prisma.asset,
      mappingModel: prisma.externalAssetMapping,
      // finalize-sync already records this attempt; a second write double-counts consecutiveFailures.
      shouldRecordSyncOutcome: false,
      transformInputItem: async (item: FleetAssetItem, userId: string) => {
        const deviceGroup = await resolveDeviceGroup({
          manufacturer: SIEMENS_HEALTHINEERS,
          product: item.productName,
          version: item.softwareVersion,
          hasCpe: false,
        });
        const fields = {
          serialNumber: item.serialNumber,
          role: item.role,
          location: item.location,
        };
        return {
          createData: { ...fields, deviceGroupId: deviceGroup.id, userId },
          updateData: regroupableEquipmentKeys.has(item.vendorId)
            ? { ...fields, deviceGroupId: deviceGroup.id }
            : fields,
          uniqueFieldConditions:
            item.serialNumber && !weakSerials.has(item.serialNumber)
              ? [{ serialNumber: item.serialNumber }]
              : [],
          artifactsData: undefined,
        };
      },
    },
    { items },
    integrationUserId,
    integrationId,
    ResourceType.Asset,
  );
}

export async function syncAssets(
  ctx: ResourceSyncCtx<FleetConfig, FleetCreds>,
): Promise<SyncOutcome> {
  const session = await createFleetSession(ctx.creds);
  const items: FleetAssetItem[] = [];
  for await (const page of listChanged(session, ctx.cursor)) {
    items.push(...page.items.map((raw) => toCanonical(raw)));
  }

  const response = await ingestFleetAssets(items, ctx.integrationId);
  await connectManagedAssets(ctx.integrationId);

  // Throwing makes finalize-sync record Error
  if (response.shouldRetry) {
    throw new Error(response.message);
  }

  return { cursor: null };
}
