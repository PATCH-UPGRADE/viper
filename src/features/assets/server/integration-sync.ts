import "server-only";
import type { z } from "zod";
import { UNKNOWN_CPE_STRING } from "@/config/constants";
import { prepareDeviceTypeSlugs } from "@/features/device-types/server/apply-device-type";
import { processIntegrationSync } from "@/features/integrations/core/sync/upsert";
import { type Prisma, ResourceType } from "@/generated/prisma";
import prisma from "@/lib/db";
import { cpeToDeviceGroup } from "@/lib/router-utils";
import type { integrationAssetInputSchema } from "../types";

type IntegrationAssetItem = z.infer<
  typeof integrationAssetInputSchema
>["items"][number];

export async function processAssetIntegrationSync(
  input: { items: IntegrationAssetItem[] },
  userId: string,
  integrationId: string,
  options: { shouldRecordSyncOutcome?: boolean } = {},
) {
  const applyDeviceType = await prepareDeviceTypeSlugs(
    input.items.map((item) => item.deviceType),
  );
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
