import "server-only";
import { fillProductDeviceType } from "@/features/device-types/server/apply-device-type";
import { resolveDeviceType } from "@/features/device-types/server/resolve-device-type";
import { processIntegrationSync } from "@/features/integrations/core/sync/upsert";
import { ResourceType } from "@/generated/prisma";
import prisma from "@/lib/db";
import { SIEMENS_HEALTHINEERS } from "@/lib/manufacturer-catalog";
import { resolveDeviceGroup } from "@/lib/router-utils";
import type { IntegrationResponse } from "@/lib/schemas";
import type { ResourceSyncCtx, SyncOutcome } from "../../../core/types";
import type { FleetConfig, FleetCreds } from "../config";
import { syncFleetContracts } from "./contracts";
import {
  computeWeakSerials,
  type FleetAssetItem,
  listChanged,
  toCanonical,
  UNKNOWN_FLEET_PRODUCT,
} from "./equipments";
import { connectUncontractedAssets } from "./manages-relationship";

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

// TODO: VW-560
/**
 * Give the product a device type from the Fleet modality label, if it has
 * none. The device type seed sets the type of known products and wins over
 * this guess.
 */
async function typeProductFromModality(
  productId: string,
  item: FleetAssetItem,
) {
  if (item.productName === UNKNOWN_FLEET_PRODUCT) return;
  const product = await prisma.product.findUniqueOrThrow({
    where: { id: productId },
    select: { deviceTypeId: true },
  });
  if (product.deviceTypeId) return;

  const deviceType = await resolveDeviceType(item.modality, {
    integration: "teamplay Fleet",
    productName: item.productName,
    materialNumber: item.materialNumber,
    modalityCode: item.modalityCode,
  });
  if (deviceType) await fillProductDeviceType(productId, deviceType.id);
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
  const checkedProductIds = new Set<string>();

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
          manufacturer: SIEMENS_HEALTHINEERS.canonicalDisplayName,
          product: item.productName,
          version: item.softwareVersion,
          hasCpe: false,
        });
        const { productId } = deviceGroup;
        if (productId && item.modality && !checkedProductIds.has(productId)) {
          checkedProductIds.add(productId);
          await typeProductFromModality(productId, item);
        }
        const fields = {
          serialNumber: item.serialNumber,
          location: item.location,
        };
        return {
          createData: { ...fields, deviceGroupId: deviceGroup.id, userId },
          updateData: regroupableEquipmentKeys.has(item.externalId)
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
  const { session } = ctx;
  const items: FleetAssetItem[] = [];
  for await (const page of listChanged(session, ctx.cursor)) {
    items.push(...page.items.map((raw) => toCanonical(raw)));
  }

  const response = await ingestFleetAssets(items, ctx.integrationId);
  const contracts = await syncFleetContracts(session, ctx.integrationId);
  await connectUncontractedAssets(
    ctx.integrationId,
    contracts.contractedAssetIds,
  );

  // Throwing makes finalize-sync record Error
  if (contracts.errorMessage) {
    throw new Error(contracts.errorMessage);
  }
  if (response.shouldRetry) {
    throw new Error(response.message);
  }

  return { cursor: null };
}
