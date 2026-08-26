import "server-only";
import prisma from "@/lib/db";
import { resolveVendor } from "@/lib/router-utils";
import { SIEMENS_HEALTHINEERS } from "../config";

export const FLEET_RESPONSIBILITIES =
  "Serviced by Siemens Healthineers — synced from the teamplay Fleet equipment inventory.";

export async function connectManagedAssets(
  integrationId: string,
): Promise<void> {
  const vendor = await resolveVendor(SIEMENS_HEALTHINEERS);

  const existingRelationship = await prisma.managesRelationship.findFirst({
    where: { vendorId: vendor.id, workOrderIntegrationId: integrationId },
    include: { assets: { select: { id: true } } },
  });

  const relationship =
    existingRelationship ??
    (await prisma.managesRelationship.create({
      data: {
        responsibilities: FLEET_RESPONSIBILITIES,
        vendorId: vendor.id,
        workOrderIntegrationId: integrationId,
      },
      include: { assets: { select: { id: true } } },
    }));

  const alreadyConnectedAssetIds = new Set(
    relationship.assets.map((a) => a.id),
  );
  const assetsSyncedFromFleet = await prisma.externalAssetMapping.findMany({
    where: { integrationId },
    select: { itemId: true },
  });
  const syncedAssetIds = assetsSyncedFromFleet.map((mapping) => mapping.itemId);

  const assetIdsToConnect = syncedAssetIds.filter(
    (assetId) => !alreadyConnectedAssetIds.has(assetId),
  );
  if (assetIdsToConnect.length === 0) return;

  await prisma.managesRelationship.update({
    where: { id: relationship.id },
    data: { assets: { connect: assetIdsToConnect.map((id) => ({ id })) } },
  });
}
