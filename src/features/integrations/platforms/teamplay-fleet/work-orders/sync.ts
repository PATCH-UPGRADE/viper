import "server-only";
import { processIntegrationSync } from "@/features/integrations/core/sync/upsert";
import { recordCreationActivity } from "@/features/tracking/server/activities";
import { ResourceType, SourceChannel } from "@/generated/prisma";
import prisma from "@/lib/db";
import type { IntegrationResponse } from "@/lib/schemas";
import { sourceContentHash } from "@/lib/source-hash";
import type { ResourceSyncCtx, SyncOutcome } from "../../../core/types";
import type { FleetConfig, FleetCreds } from "../config";
import { createFleetSession } from "../session";
import {
  type FleetWorkOrderItem,
  listChanged,
  toCanonical,
} from "./activities";
import { FLEET_SOURCE_LABEL } from "./constants";
import { provisionalExternalId } from "./tickets";

/**
 * Point the mappings VIPER minted itself at the ids Fleet gave them.
 *
 * When Fleet accepts an order but returns an unreadable body, the mapping holds
 * a provisional id built from our `ownIncidentNumber`. Fleet echoes that number
 * back on the activity, so the first poll that carries it can swap in the real
 * ticket key. Without this the ingest below finds no mapping for that key and
 * files a second ticket for an order that already exists.
 *
 * One proposal covering N assets sends the same `ownIncidentNumber` on N
 * orders, so the reference alone does not identify an order. The equipment key
 * is what separates them, and it is already part of the provisional id, so the
 * whole id is rebuilt from the activity and matched exactly.
 */
export async function reconcileProvisionalMappings(
  items: FleetWorkOrderItem[],
  integrationId: string,
): Promise<void> {
  const realIdByProvisionalId = new Map<string, string>();
  for (const item of items) {
    if (!item.ownIncidentNumber || !item.equipmentKey) continue;
    realIdByProvisionalId.set(
      provisionalExternalId(item.ownIncidentNumber, item.equipmentKey),
      item.vendorId,
    );
  }
  if (realIdByProvisionalId.size === 0) return;

  // Both halves in one query: the provisional rows to rewrite, and any row that
  // already holds one of the real ids.
  const rows = await prisma.externalWorkOrderMapping.findMany({
    where: {
      integrationId,
      externalId: {
        in: [
          ...realIdByProvisionalId.keys(),
          ...realIdByProvisionalId.values(),
        ],
      },
    },
    select: { id: true, externalId: true },
  });

  // `(integrationId, externalId)` is unique, so claiming a key another mapping
  // already holds rejects the write and fails the whole sync.
  const taken = new Set(rows.map((row) => row.externalId));

  for (const row of rows) {
    const realId = realIdByProvisionalId.get(row.externalId);
    if (!realId || taken.has(realId)) continue;

    await prisma.externalWorkOrderMapping.update({
      where: { id: row.id },
      data: { externalId: realId },
    });
    taken.add(realId);
  }
}

async function ingestFleetWorkOrders(
  items: FleetWorkOrderItem[],
  integrationId: string,
): Promise<IntegrationResponse> {
  const { integrationUserId } = await prisma.integration.findUniqueOrThrow({
    where: { id: integrationId },
    select: { integrationUserId: true },
  });

  return processIntegrationSync(
    prisma,
    {
      model: prisma.workOrderTicket,
      mappingModel: prisma.externalWorkOrderMapping,
      // Every other ingest path records this, so a Fleet-synced work order gets
      // the same "created" entry in its timeline.
      onItemCreated: (id: string) => recordCreationActivity(id),
      // finalize-sync already records this attempt; a second write double-counts
      // consecutiveFailures.
      shouldRecordSyncOutcome: false,
      transformInputItem: async (item: FleetWorkOrderItem, userId: string) => {
        const fields = {
          summary: item.summary,
          body: item.body,
          status: item.status,
          category: item.category,
          scheduledAt: item.scheduledAt ? new Date(item.scheduledAt) : null,
          sourceLabel: FLEET_SOURCE_LABEL,
        };
        return {
          createData: { ...fields, creatorId: userId },
          // Never reassign the creator on re-sync; only refresh mutable fields.
          updateData: fields,
          // A work order has no natural business key, so with no external
          // mapping there is nothing to match on and the ticket is new.
          uniqueFieldConditions: [],
          artifactsData: undefined,
        };
      },
    },
    { items },
    integrationUserId,
    integrationId,
    ResourceType.WorkOrder,
  );
}

/**
 * Record what each activity looked like on this poll.
 *
 * Snapshots are append-only and deduplicate on `contentHash`, so an unchanged
 * activity costs no write. The mapping owns the snapshots, which keeps the
 * record off the global `(channel, externalId)` unique key that only channels
 * without a mapping use.
 *
 * Fleet cannot filter its activities by change, so every poll carries the whole
 * collection. The work is therefore batched into a fixed number of queries: a
 * per-activity round trip would cost thousands of them an hour to discover that
 * nothing moved.
 */
async function recordSources(
  items: FleetWorkOrderItem[],
  integrationId: string,
): Promise<void> {
  if (items.length === 0) return;

  const tickets = await prisma.externalWorkOrderMapping.findMany({
    where: {
      integrationId,
      externalId: { in: items.map((item) => item.vendorId) },
    },
    select: { externalId: true, itemId: true },
  });
  const ticketByExternalId = new Map(
    tickets.map((t) => [t.externalId, t.itemId]),
  );

  // An activity the ingest could not land has nothing to attach a snapshot to.
  const landed = items.filter((item) => ticketByExternalId.has(item.vendorId));
  if (landed.length === 0) return;

  const lastSynced = new Date();
  const existing = await prisma.externalSourceRecordMapping.findMany({
    where: {
      integrationId,
      externalId: { in: landed.map((item) => item.vendorId) },
    },
    select: { id: true, externalId: true },
  });
  const mappingIdByExternalId = new Map(
    existing.map((mapping) => [mapping.externalId, mapping.id]),
  );

  const missing = landed.filter(
    (item) => !mappingIdByExternalId.has(item.vendorId),
  );
  if (missing.length > 0) {
    const created =
      await prisma.externalSourceRecordMapping.createManyAndReturn({
        data: missing.map((item) => ({
          integrationId,
          externalId: item.vendorId,
          lastSynced,
        })),
        select: { id: true, externalId: true },
      });
    for (const mapping of created) {
      mappingIdByExternalId.set(mapping.externalId, mapping.id);
    }
  }
  if (existing.length > 0) {
    await prisma.externalSourceRecordMapping.updateMany({
      where: { id: { in: existing.map((mapping) => mapping.id) } },
      data: { lastSynced },
    });
  }

  // Newest snapshot per mapping in one query, so the hash comparison below
  // needs no further round trips.
  const newest = await prisma.sourceRecord.findMany({
    where: { mappingId: { in: [...mappingIdByExternalId.values()] } },
    orderBy: [{ mappingId: "asc" }, { observedAt: "desc" }],
    distinct: ["mappingId"],
    select: { mappingId: true, contentHash: true },
  });
  const newestHashByMappingId = new Map(
    newest.map((record) => [record.mappingId, record.contentHash]),
  );

  const changed: {
    item: FleetWorkOrderItem;
    mappingId: string;
    contentHash: string;
  }[] = [];
  for (const item of landed) {
    const mappingId = mappingIdByExternalId.get(item.vendorId);
    if (!mappingId) continue;
    const contentHash = sourceContentHash(item.raw, item.body);
    if (newestHashByMappingId.get(mappingId) === contentHash) continue;
    changed.push({ item, mappingId, contentHash });
  }
  if (changed.length === 0) return;

  const records = await prisma.sourceRecord.createManyAndReturn({
    data: changed.map(({ item, mappingId, contentHash }) => ({
      channel: SourceChannel.Integration,
      mappingId,
      contentHash,
      raw: item.raw,
      markdown: item.body,
    })),
    select: { id: true, mappingId: true },
  });
  const recordIdByMappingId = new Map(
    records.map((record) => [record.mappingId, record.id]),
  );

  await prisma.sourceLink.createMany({
    data: changed.flatMap(({ item, mappingId }) => {
      const sourceRecordId = recordIdByMappingId.get(mappingId);
      const workOrderTicketId = ticketByExternalId.get(item.vendorId);
      if (!sourceRecordId || !workOrderTicketId) return [];
      return [{ sourceRecordId, workOrderTicketId }];
    }),
    skipDuplicates: true,
  });
}

export async function syncWorkOrders(
  ctx: ResourceSyncCtx<FleetConfig, FleetCreds>,
): Promise<SyncOutcome> {
  const session = await createFleetSession(ctx.creds);

  const items: FleetWorkOrderItem[] = [];
  for await (const page of listChanged(session, ctx.cursor)) {
    items.push(...page.items.map(toCanonical));
  }

  await reconcileProvisionalMappings(items, ctx.integrationId);
  const response = await ingestFleetWorkOrders(items, ctx.integrationId);
  await recordSources(items, ctx.integrationId);

  // Throwing makes finalize-sync record Error.
  if (response.shouldRetry) {
    throw new Error(response.message);
  }

  return { cursor: null };
}
