import "server-only";
import {
  handlePrismaError,
  processIntegrationSync,
} from "@/features/integrations/core/sync/upsert";
import type {
  ResourceSyncCtx,
  Session,
  SyncOutcome,
} from "@/features/integrations/core/types";
import { ResourceType, SourceChannel } from "@/generated/prisma";
import prisma from "@/lib/db";
import type { IntegrationResponse } from "@/lib/schemas";
import { sourceContentHash } from "@/lib/source-hash";
import type { FleetConfig, FleetCreds } from "../config";
import { createFleetSession } from "../session";
import { type FleetAdvisoryItem, listChanged, toCanonical } from "./advisories";

async function recordAdvisory(
  integrationId: string,
  item: FleetAdvisoryItem,
): Promise<string | null> {
  const mapping = await prisma.externalSourceRecordMapping.upsert({
    where: {
      integrationId_externalId: { integrationId, externalId: item.vendorId },
    },
    create: {
      integrationId,
      externalId: item.vendorId,
      lastSynced: new Date(),
    },
    update: { lastSynced: new Date() },
    select: { id: true },
  });

  const contentHash = sourceContentHash(item.raw, item.body);
  const newest = await prisma.sourceRecord.findFirst({
    where: { mappingId: mapping.id },
    orderBy: { observedAt: "desc" },
    select: { contentHash: true },
  });

  if (newest?.contentHash === contentHash) return null;
  const snapshot = await prisma.sourceRecord.create({
    data: {
      channel: SourceChannel.Integration,
      mappingId: mapping.id,
      contentHash,
      raw: item.raw,
      markdown: item.body,
    },
    select: { id: true },
  });

  return snapshot.id;
}

export async function inngestFleetAdvisories(
  items: FleetAdvisoryItem[],
  integrationId: string,
  session: Session,
): Promise<IntegrationResponse> {
  const { integrationUserId } = await prisma.integration.findUniqueOrThrow({
    where: { id: integrationId },
    select: { integrationUserId: true },
  });

  return processIntegrationSync(
    prisma,
    {
      model: prisma.sourceRecord,
      mappingModel: prisma.externalSourceRecordMapping,
      shouldRecordSyncOutcome: false,
      transformInputItem: async (item: FleetAdvisoryItem) => {
        const fields = {
          channel: SourceChannel.Integration,
          contentHash: sourceContentHash(item.raw, item.body),
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

  const items = [...byVendorId.values()];
  const response = await inngestFleetAdvisories(
    items,
    ctx.integrationId,
    session,
  );
  if (response.shouldRetry) {
    throw new Error(response.message);
  }
  return { cursor: null };
}
