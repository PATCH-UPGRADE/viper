import "server-only";
import type { z } from "zod";
import {
  processIntegrationSync,
  type SyncRun,
} from "@/features/integrations/core/sync/upsert";
import { ResourceType } from "@/generated/prisma";
import prisma from "@/lib/db";
import { resolveMatchingIdForDevice } from "@/lib/router-utils";
import type { integrationDeviceArtifactInputSchema } from "../types";
import { requestArtifactNoteExtraction } from "./request-note-extraction";

type IntegrationDeviceArtifactItem = z.infer<
  typeof integrationDeviceArtifactInputSchema
>["items"][number];

export function processDeviceArtifactIntegrationSync(
  input: { items: IntegrationDeviceArtifactItem[] },
  run: SyncRun,
  options: { shouldRecordSyncOutcome?: boolean } = {},
) {
  return processIntegrationSync(
    {
      model: prisma.deviceArtifact,
      mappingModel: prisma.externalDeviceArtifactMapping,
      shouldRecordSyncOutcome: options.shouldRecordSyncOutcome,
      transformInputItem: async (item: IntegrationDeviceArtifactItem) => {
        const {
          device,
          externalId: _externalId,
          artifacts,
          upstreamApi: _upstreamApi,
          webUrl: _webUrl,
          ...itemData
        } = item;
        const identityMatchingId = await resolveMatchingIdForDevice(device);
        const matchingConnect = [{ id: identityMatchingId }];

        return {
          createData: {
            ...itemData,
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
    run,
    ResourceType.DeviceArtifact,
  );
}
