import "server-only";
import { processIntegrationSync } from "@/features/integrations/core/sync/upsert";
import type {
  ResourceSyncCtx,
  SyncOutcome,
} from "@/features/integrations/core/types";
import { ResourceType, SourceChannel } from "@/generated/prisma";
import prisma from "@/lib/db";
import type { IntegrationResponse } from "@/lib/schemas";
import { sourceContentHash } from "@/lib/source-hash";
import type { FleetConfig, FleetCreds } from "../config";
import { createFleetSession } from "../session";
import { type FleetAdvisoryItem, listChanged, toCanonical } from "./advisories";
import { mappingPaths } from "@/features/integrations/core/mapping-urls";

type FleetAdvisoryDraft = FleetAdvisoryItem & {
  contentHash: string;
  mappingId: string | null;
};

async function changedOnly(
  integrationId: string,
  items: FleetAdvisoryItem[],
): Promise<FleetAdvisoryDraft[]> {
  const mappings = await prisma.externalSourceRecordMapping.findMany({
    where: {
      integrationId,
      externalId: { in: items.map((item) => item.vendorId) },
    },
    select: { id: true, externalId: true },
  });

  const mappingIdByExternalId = new Map(
    mappings.map((m) => [m.externalId, m.id]),
  );
  if (mappings.length > 0) {
    await prisma.externalSourceRecordMapping.updateMany({
      where: { id: { in: mappings.map((m) => m.id) } },
      data: { lastSynced: new Date() },
    });
  }

  const newest = await prisma.sourceRecord.findMany({
    where: { mappingId: { in: [...mappingIdByExternalId.values()] } },
    orderBy: [{ mappingId: "asc" }, { observedAt: "desc" }],
    distinct: ["mappingId"],
    select: { mappingId: true, contentHash: true },
  });

  const newestHash = new Map<string, string>();
  for (const record of newest) {
    if (record.mappingId) newestHash.set(record.mappingId, record.contentHash);
  }

  return items.flatMap((item) => {
    const contentHash = sourceContentHash(item.raw, item.body);
    const mappingId = mappingIdByExternalId.get(item.vendorId) ?? null;
    if (mappingId && newestHash.get(mappingId) === contentHash) return [];
    return [{ ...item, contentHash, mappingId }];
  });
}

export async function inngestFleetAdvisories(
  items: FleetAdvisoryDraft[],
  integrationId: string,
): Promise<IntegrationResponse> {
  const { integrationUserId } = await prisma.integration.findUniqueOrThrow({
    where: { id: integrationId },
    select: { integrationUserId: true },
  });

  return processIntegrationSync(
    prisma,
    {
      model: {
        ...prisma.sourceRecord,
        update: ({ data }) => prisma.sourceRecord.create({ data }),
      },
      mappingModel: prisma.externalSourceRecordMapping,
      shouldRecordSyncOutcome: false,
      onItemCreated: async (sourceRecordId: string) => {
        const mapping = await prisma.externalSourceRecordMapping.findFirst({
          where: { itemId: sourceRecordId },
          select: { id: true },
        });
        if (mapping) {
          await prisma.sourceRecord.update({
            where: { id: sourceRecordId },
            data: { mappingId: mapping.id },
          });
        }
      },
      transformInputItem: async (item: FleetAdvisoryDraft) => {
        const fields = {
          channel: SourceChannel.Integration,
          contentHash: item.contentHash,
          raw: item.raw,
          markdown: item.body,
        };
        return {
          createData: fields,
          updateData: fields,
          uniqueFieldConditions: [],
          artifactsData: undefined,
        };
      },
    },
    { items },
    integrationUserId,
    integrationId,
    ResourceType.SourceRecord,
  );
}

export async function recordAdvisories(
  integrationId: string,
  items: FleetAdvisoryItem[],
): Promise<IntegrationResponse> {
  const changed = await changedOnly(integrationId, items);
  return inngestFleetAdvisories(changed, integrationId);
}

export async function syncAdvisories(
  ctx: ResourceSyncCtx<FleetConfig, FleetCreds>,
): Promise<SyncOutcome> {
  const session = await createFleetSession(ctx.creds);
  const byVendorId = new Map<string, FleetAdvisoryItem>();

  for await (const page of listChanged(session, ctx.cursor)) {
    for (const raw of page.items) {
      const item = toCanonical(raw);
      byVendorId.set(item.vendorId, item);
    }
  }
  const changed = await changedOnly(ctx.integrationId, [
    ...byVendorId.values(),
  ]);
  const response = await inngestFleetAdvisories(changed, ctx.integrationId);
  if (response.shouldRetry) {
    throw new Error(response.message);
  }
  return { cursor: null };
}
