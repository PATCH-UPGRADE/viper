import "server-only";
import type { z } from "zod";
import { processIntegrationSync } from "@/features/integrations/core/sync/upsert";
import { ResourceType } from "@/generated/prisma";
import prisma from "@/lib/db";
import { cpesToMatchingConnect } from "@/lib/router-utils";
import type { integrationVulnerabilityInputSchema } from "../types";

type IntegrationVulnerabilityItem = z.infer<
  typeof integrationVulnerabilityInputSchema
>["items"][number];

export function processVulnerabilityIntegrationSync(
  input: {
    items: (Omit<IntegrationVulnerabilityItem, "sarif"> & {
      sarif?: IntegrationVulnerabilityItem["sarif"];
    })[];
  },
  userId: string,
  integrationId: string,
  options: { shouldRecordSyncOutcome?: boolean } = {},
) {
  return processIntegrationSync(
    prisma,
    {
      model: prisma.vulnerability,
      mappingModel: prisma.externalVulnerabilityMapping,
      shouldRecordSyncOutcome: options.shouldRecordSyncOutcome,
      transformInputItem: async (item, userId) => {
        const {
          cpes,
          sarif,
          externalId: _externalId,
          upstreamApi: _upstreamApi,
          webUrl: _webUrl,
          ...itemData
        } = item;
        const connect = cpes ? await cpesToMatchingConnect(cpes) : [];

        return {
          createData: {
            ...itemData,
            // Vulnerability.sarif is a required Json column, and most sources
            // have no SARIF to give.
            sarif: sarif ?? {},
            userId,
            deviceGroupMatchings: { connect },
          },
          updateData: {
            ...itemData,
            sarif,
            // Only replace matchings when CPEs were provided; omitting them
            // on re-sync must not clear a vulnerability's existing matchings.
            ...(cpes ? { deviceGroupMatchings: { set: connect } } : {}),
          },
          uniqueFieldConditions: [],
          // ^always create unmapped vulns
          artifactsData: undefined,
          // ^vulnerability integrations do not include artifacts
        };
      },
    },
    input,
    userId,
    integrationId,
    ResourceType.Vulnerability,
  );
}
