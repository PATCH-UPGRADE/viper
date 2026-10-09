import "server-only";
import type { z } from "zod";
import { UNKNOWN_CPE_STRING } from "@/config/constants";
import {
  type ApplyDeviceType,
  prepareDeviceTypeSlugs,
} from "@/features/device-types/server/apply-device-type";
import { processIntegrationSync } from "@/features/integrations/core/sync/upsert";
import { type Prisma, ResourceType } from "@/generated/prisma";
import prisma from "@/lib/db";
import { cpeToDeviceGroup } from "@/lib/router-utils";
import type { integrationAssetInputSchema } from "../types";

type IntegrationAssetItem = z.infer<
  typeof integrationAssetInputSchema
>["items"][number];

export function processAssetIntegrationSync(
  input: { items: IntegrationAssetItem[] },
  userId: string,
  integrationId: string,
  applyDeviceType: ApplyDeviceType,
  options: { shouldRecordSyncOutcome?: boolean } = {},
) {
  return processIntegrationSync(
    prisma,
    {
      model: prisma.asset,
      mappingModel: prisma.externalAssetMapping,
      shouldRecordSyncOutcome: options.shouldRecordSyncOutcome,
      transformInputItem: async (item, userId) => {
        const {
          cpe,
          externalId: _externalId,
          utilization,
          upstreamApi: _upstreamApi,
          webUrl: _webUrl,
          deviceType,
          ...itemData
        } = item;
        const deviceGroup = await cpeToDeviceGroup(cpe ?? UNKNOWN_CPE_STRING);
        await applyDeviceType(deviceGroup.productId, deviceType);

        const uniqueFields = [
          "hostname",
          "macAddress",
          "serialNumber",
        ] as const;
        const uniqueFieldConditions = uniqueFields
          .filter((field) => itemData[field])
          .map((field) => ({ [field]: itemData[field] }));

        return {
          createData: {
            ...itemData,
            utilization: utilization as Prisma.InputJsonValue | undefined,
            deviceGroupId: deviceGroup.id,
            userId,
          },
          updateData: {
            ...itemData,
            utilization: utilization as Prisma.InputJsonValue | undefined,
            deviceGroupId: deviceGroup.id,
          },
          uniqueFieldConditions,
          artifactsData: undefined,
          // ^asset integrations do not include artifacts
        };
      },
    },
    input,
    userId,
    integrationId,
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
  userId: string,
  integrationId: string,
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
      integrationId,
      deviceType: item.deviceType,
    });
    return { ...item, deviceType: null };
  });
  const applyDeviceType = await prepareDeviceTypeSlugs(
    items.map((item) => item.deviceType),
  );
  return processAssetIntegrationSync(
    { ...input, items },
    userId,
    integrationId,
    applyDeviceType,
    options,
  );
}
