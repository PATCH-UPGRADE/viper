import "server-only";
import { processIntegrationSync } from "@/features/integrations/core/sync/upsert";
import { ResourceType } from "@/generated/prisma";
import prisma from "@/lib/db";
import { resolveDeviceGroup } from "@/lib/router-utils";
import type { IntegrationResponse } from "@/lib/schemas";
import type { SyncCtx, SyncOutcome } from "../../core/types";
import { assets, computeWeakSerials, type FleetAssetItem } from "./assets";
import {
  type FleetConfig,
  type FleetCreds,
  SIEMENS_HEALTHINEERS,
} from "./config";
import { connectManagedAssets } from "./manages-relationship";
import { createFleetSession } from "./session";

async function ingestFleetAssets(
  items: FleetAssetItem[],
  integrationId: string,
): Promise<IntegrationResponse> {
  const { integrationUserId } = await prisma.integration.findUniqueOrThrow({
    where: { id: integrationId },
    select: { integrationUserId: true },
  });
  // Serials shared by two Fleet records (Syngo Carbon components) must not
  // fall back to serial matching, or both would link to one asset.
  const weakSerials = computeWeakSerials(items);

  return processIntegrationSync(
    prisma,
    {
      model: prisma.asset,
      mappingModel: prisma.externalAssetMapping,
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
          // No deviceGroupId: a re-sync must not re-group an asset whose
          // identity another source (CPE, scanner) already established.
          updateData: fields,
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

export async function fleetSync(
  ctx: SyncCtx<FleetConfig, FleetCreds>,
): Promise<SyncOutcome> {
  if (ctx.resource !== ResourceType.Asset) {
    throw new Error(
      `teamplay Fleet has no ${ctx.resource} sync yet (work orders: VW-432/VW-433; advisories are a separate ticket)`,
    );
  }

  const session = await createFleetSession(ctx.creds);
  const items: FleetAssetItem[] = [];
  for await (const page of assets.listChanged(session, ctx.cursor)) {
    items.push(...page.items.map((raw) => assets.toCanonical(raw, ctx.config)));
  }

  const response = await ingestFleetAssets(items, ctx.integrationId);
  // Throwing (not returning) is what makes finalize-sync record Error and back
  // off; a normal return would overwrite the partial failure with Success.
  if (response.shouldRetry) {
    throw new Error(response.message);
  }

  await connectManagedAssets(ctx.integrationId);
  return { cursor: null };
}
