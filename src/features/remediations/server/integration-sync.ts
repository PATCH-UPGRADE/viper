import "server-only";
import type { z } from "zod";
import { processIntegrationSync } from "@/features/integrations/core/sync/upsert";
import { ResourceType } from "@/generated/prisma";
import prisma from "@/lib/db";
import { devicesToMatchingConnect } from "@/lib/router-utils";
import { impactRowsUpdate } from "../impact";
import type { integrationRemediationInputSchema } from "../types";

type IntegrationRemediationItem = z.infer<
  typeof integrationRemediationInputSchema
>["items"][number];

export function processRemediationIntegrationSync(
  input: { items: IntegrationRemediationItem[] },
  userId: string,
  integrationId: string,
  options: { shouldRecordSyncOutcome?: boolean } = {},
) {
  return processIntegrationSync(
    prisma,
    {
      model: prisma.remediation,
      mappingModel: prisma.externalRemediationMapping,
      shouldRecordSyncOutcome: options.shouldRecordSyncOutcome,
      transformInputItem: async (item, userId) => {
        const {
          externalId: _externalId,
          artifacts,
          devices,
          vulnerabilityIds,
          impacts,
          upstreamApi: _upstreamApi,
          webUrl: _webUrl,
          ...itemData
        } = item;
        const matchingConnect = devices
          ? await devicesToMatchingConnect(devices)
          : [];
        const vulnerabilities =
          vulnerabilityIds &&
          [...new Set(vulnerabilityIds)].map((id) => ({ id }));

        return {
          createData: {
            ...itemData,
            userId,
            impacts: { create: impacts ?? [] },
            deviceGroupMatchings: { connect: matchingConnect },
            vulnerabilities: { connect: vulnerabilities ?? [] },
          },
          updateData: {
            ...itemData,
            impacts: impactRowsUpdate(impacts, "replace"),
            // Only replace matchings when devices were provided; omitting them
            // on re-sync must not clear a remediation's existing matchings.
            ...(devices
              ? { deviceGroupMatchings: { set: matchingConnect } }
              : {}),
            vulnerabilities: vulnerabilities && { set: vulnerabilities },
          },
          uniqueFieldConditions: [],
          artifactsData: {
            artifacts,
            artifactWrapperParentField: "remediationId",
          },
        };
      },
    },
    input,
    userId,
    integrationId,
    ResourceType.Remediation,
  );
}
