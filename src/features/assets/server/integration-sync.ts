import "server-only";
import type { z } from "zod";
import {
  type ApplyDeviceType,
  prepareDeviceTypeSlugs,
} from "@/features/device-types/server/apply-device-type";
import {
  processIntegrationSync,
  type SyncRun,
} from "@/features/integrations/core/sync/upsert";
import { type Prisma, ResourceType } from "@/generated/prisma";
import prisma from "@/lib/db";
import { deviceInputToAsset } from "@/lib/router-utils";
import type { integrationAssetInputSchema } from "../types";

type IntegrationAssetItem = z.infer<
  typeof integrationAssetInputSchema
>["items"][number];

/** The product of the asset that a synced item is about, if VIPER has it. */
async function currentProductId(
  integrationId: string,
  externalId: string,
  uniqueFieldConditions: Prisma.AssetWhereInput[],
): Promise<string | null> {
  const mapping = await prisma.externalAssetMapping.findFirst({
    where: { integrationId, externalId },
    select: { item: { select: { productId: true } } },
  });
  if (mapping) return mapping.item.productId;
  if (uniqueFieldConditions.length === 0) return null;

  const asset = await prisma.asset.findFirst({
    where: { OR: uniqueFieldConditions },
    select: { productId: true },
  });
  return asset?.productId ?? null;
}

export function processAssetIntegrationSync(
  input: { items: IntegrationAssetItem[] },
  run: SyncRun,
  applyDeviceType: ApplyDeviceType,
  options: { shouldRecordSyncOutcome?: boolean } = {},
) {
  return processIntegrationSync(
    {
      entityType: "ASSET",
      shouldRecordSyncOutcome: options.shouldRecordSyncOutcome,
      transformInputItem: async (item: IntegrationAssetItem) => {
        const {
          device: deviceInput,
          externalId,
          upstreamApi: _upstreamApi,
          webUrl: _webUrl,
          deviceType,
          ...itemData
        } = item;
        // A missing device keeps the one that the asset has, and null clears it.
        const device =
          deviceInput === undefined
            ? undefined
            : await deviceInputToAsset(deviceInput);

        const uniqueFields = [
          "hostname",
          "macAddress",
          "serialNumber",
        ] as const;
        const uniqueFieldConditions = uniqueFields
          .filter((field) => itemData[field])
          .map((field) => ({ [field]: itemData[field] }));

        if (deviceType) {
          const productId = device
            ? device.productId
            : await currentProductId(
                run.integrationId,
                externalId,
                uniqueFieldConditions,
              );
          await applyDeviceType(productId, deviceType);
        }

        const fields = { ...itemData, ...device };
        return {
          create: { fields },
          update: { fields },
          uniqueFieldConditions,
        };
      },
    },
    input,
    run,
    ResourceType.Asset,
  );
}

/**
 * The AI crawler's path into processAssetIntegrationSync. The crawler is an
 * LLM and can invent a deviceType slug, so an unknown slug is dropped with a
 * warning instead of failing the whole crawl, as it fails a partner batch.
 */
export async function processCrawledAssetIntegrationSync(
  input: { items: IntegrationAssetItem[] },
  run: SyncRun,
  options: { shouldRecordSyncOutcome?: boolean } = {},
) {
  const knownSlugs = new Set(
    (await prisma.deviceType.findMany({ select: { slug: true } })).map(
      (deviceType) => deviceType.slug,
    ),
  );
  const items = input.items.map((item) => {
    if (!item.deviceType || knownSlugs.has(item.deviceType)) return item;
    console.warn("AI crawler sent an unknown deviceType, dropped it", {
      integrationId: run.integrationId,
      deviceType: item.deviceType,
    });
    return { ...item, deviceType: null };
  });
  const applyDeviceType = await prepareDeviceTypeSlugs(
    items.map((item) => item.deviceType),
  );
  return processAssetIntegrationSync(
    { ...input, items },
    run,
    applyDeviceType,
    options,
  );
}
