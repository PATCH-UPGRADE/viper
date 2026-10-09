import "server-only";
import { TRPCError } from "@trpc/server";
import type { z } from "zod";
import {
  handlePrismaError,
  upsertResourceSync,
} from "@/features/integrations/core/sync/upsert";
import { ResourceType, type VulnerabilitySource } from "@/generated/prisma";
import prisma from "@/lib/db";
import type { IntegrationResponse } from "@/lib/schemas";
import type { integrationVulnerabilityInputSchema } from "../types";
import { recordDataFromInput, recordPatchFromInput } from "./record-input";
import {
  createVulnerabilityRecord,
  deleteVulnerabilityRecord,
  updateVulnerabilityRecord,
} from "./records";

type IntegrationVulnerabilityItem = z.infer<
  typeof integrationVulnerabilityInputSchema
>["items"][number];

const errorMessage = (error: unknown) =>
  error instanceof TRPCError ? error.message : handlePrismaError(error);

/**
 * Upsert the vulnerability records an integration sends. Each item is one record, keyed by the
 * integration's ID for it (ExternalVulnerabilityRecordMapping): a known item updates its record,
 * a new one creates a record, which joins the vulnerability its identifiers name.
 *
 * Not the generic processIntegrationSync: records go through the record service, which finds the
 * vulnerability and opens Issues for new devices.
 *
 * @param integrationUserId The integration's shadow user. Integration records have no owner; it
 *   only fills the legacy Vulnerability.userId column.
 * @param options.source Every record's source, for integrations with one (the AI crawler).
 *   Otherwise each item's source follows the API rules.
 */
export async function processVulnerabilityIntegrationSync(
  input: { items: IntegrationVulnerabilityItem[] },
  integrationUserId: string,
  integrationId: string,
  options: {
    source?: VulnerabilitySource;
    shouldRecordSyncOutcome?: boolean;
  } = {},
): Promise<IntegrationResponse> {
  const lastSynced = new Date();
  const errors: string[] = [];
  const response: IntegrationResponse = {
    message: "success",
    createdItemsCount: 0,
    updatedItemsCount: 0,
    shouldRetry: false,
    syncedAt: lastSynced.toISOString(),
  };

  for (const item of input.items) {
    const {
      externalId,
      upstreamApi = null,
      webUrl = null,
      ...recordInput
    } = item;
    const mappingFields = { lastSynced, upstreamApi, webUrl };

    try {
      const mapping =
        await prisma.externalVulnerabilityRecordMapping.findUnique({
          where: {
            external_vulnerability_record_mappings_integration_external_key: {
              integrationId,
              externalId,
            },
          },
          select: { id: true, itemId: true },
        });

      if (mapping) {
        await updateVulnerabilityRecord(
          mapping.itemId,
          await recordPatchFromInput(recordInput),
        );
        await prisma.externalVulnerabilityRecordMapping.update({
          where: { id: mapping.id },
          data: mappingFields,
        });
        response.updatedItemsCount++;
        continue;
      }

      const { record } = await createVulnerabilityRecord(
        await recordDataFromInput(recordInput, {
          source: options.source,
          userId: null,
        }),
        { actingUserId: integrationUserId },
      );
      try {
        await prisma.externalVulnerabilityRecordMapping.create({
          data: {
            itemId: record.id,
            integrationId,
            externalId,
            ...mappingFields,
          },
        });
      } catch (error) {
        // A concurrent sync mapped this item first; drop the duplicate record.
        await deleteVulnerabilityRecord(record.id);
        throw error;
      }
      response.createdItemsCount++;
    } catch (error) {
      console.error("vulnerability record sync failed", { externalId, error });
      errors.push(errorMessage(error));
    }
  }

  if (errors.length > 0) {
    // Same shape as processIntegrationSync: `message` doubles as the sync's errorMessage.
    response.shouldRetry = true;
    response.message = `${errors.length} of ${input.items.length} items failed: ${errors[0]}`;
  }

  if (options.shouldRecordSyncOutcome ?? true) {
    await upsertResourceSync(
      integrationId,
      ResourceType.Vulnerability,
      response,
      lastSynced,
    );
  }

  return response;
}
