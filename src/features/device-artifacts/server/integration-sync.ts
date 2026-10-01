import "server-only";
import type { z } from "zod";
import { processIntegrationSync } from "@/features/integrations/core/sync/upsert";
import { ResourceType } from "@/generated/prisma";
import prisma from "@/lib/db";
import { resolveMatchingIdFromCpe } from "@/lib/router-utils";
import type { integrationDeviceArtifactInputSchema } from "../types";
import { requestArtifactNoteExtraction } from "./request-note-extraction";

type IntegrationDeviceArtifactItem = z.infer<
  typeof integrationDeviceArtifactInputSchema
>["items"][number];

export function processDeviceArtifactIntegrationSync(
  input: { items: IntegrationDeviceArtifactItem[] },
  userId: string,
  integrationId: string,
  options: { shouldRecordSyncOutcome?: boolean } = {},
) {
  return processIntegrationSync(
    prisma,
    {
      model: prisma.deviceArtifact,
      mappingModel: prisma.externalDeviceArtifactMapping,
      shouldRecordSyncOutcome: options.shouldRecordSyncOutcome,
      transformInputItem: async (item, userId) => {
        const {
          cpe,
          vendorId: _vendorId,
          artifacts,
          upstreamApi: _upstreamApi,
          webUrl: _webUrl,
          ...itemData
        } = item;
        const identityMatchingId = await resolveMatchingIdFromCpe(cpe);
        const matchingConnect = [{ id: identityMatchingId }];

        return {
          createData: {
            ...itemData,
            user: {
              connect: { id: userId },
            },
            deviceGroupMatchings: { connect: matchingConnect },
          },
          updateData: {
            ...itemData,
            deviceGroupMatchings: { set: matchingConnect },
          },
          uniqueFieldConditions: [],
          artifactsData: {
            artifacts,
            artifactWrapperParentField: "deviceArtifactId",
          },
        };
      },
      // Extract notes from any uploaded PDF docs on newly-synced artifacts.
      onItemCreated: (id) => requestArtifactNoteExtraction(id),
    },
    input,
    userId,
    integrationId,
    ResourceType.DeviceArtifact,
  );
}
