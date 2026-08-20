import "server-only";
import prisma from "@/lib/db";
import { resolveVendor } from "@/lib/router-utils";
import { SIEMENS_HEALTHINEERS } from "./config";

export const FLEET_RESPONSIBILITIES =
  "Serviced by Siemens Healthineers — synced from the teamplay Fleet equipment inventory.";

export async function connectManagedAssets(
  integrationId: string,
): Promise<void> {
  const vendor = await resolveVendor(SIEMENS_HEALTHINEERS);

  const relationship =
    (await prisma.managesRelationship.findFirst({
      where: { vendorId: vendor.id, workOrderIntegrationId: integrationId },
      include: { assets: { select: { id: true } } },
    })) ??
    (await prisma.managesRelationship.create({
      data: {
        responsibilities: FLEET_RESPONSIBILITIES,
        vendorId: vendor.id,
        workOrderIntegrationId: integrationId,
      },
      include: { assets: { select: { id: true } } },
    }));

  const connected = new Set(relationship.assets.map((a) => a.id));
  const mapped = await prisma.externalAssetMapping.findMany({
    where: { integrationId },
    select: { itemId: true },
  });
  const toConnect = mapped.filter((m) => !connected.has(m.itemId));
  if (toConnect.length === 0) return;

  await prisma.managesRelationship.update({
    where: { id: relationship.id },
    data: { assets: { connect: toConnect.map((m) => ({ id: m.itemId })) } },
  });
}
