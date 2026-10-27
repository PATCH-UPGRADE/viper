import "server-only";
import { type Prisma, SourceChannel } from "@/generated/prisma";
import prisma from "@/lib/db";
import { sourceContentHash } from "@/lib/source-hash";

/** What a pulled work order must carry for its snapshot. */
export interface WorkOrderSourceItem {
  externalId: string;
  raw: Prisma.InputJsonValue;
  body: string;
}

/**
 * Record what each pulled work order looked like on this poll, and link the
 * snapshot to its ticket.
 *
 * Snapshots are append-only and deduplicate on `contentHash`, so an unchanged
 * record costs no write. The mapping owns the snapshots, which keeps the
 * record off the global `(channel, externalId)` unique key that only channels
 * without a mapping use.
 *
 * For a repeated `externalId`, only the last item is recorded. The hash
 * comparison reads the newest stored record and cannot see a sibling created in
 * the same pass, so two items with one id write two snapshots, and only one of
 * them gets a SourceLink.
 *
 * A platform that cannot filter by change carries its whole collection on every
 * poll. The work is therefore batched into a fixed number of queries: a
 * per-record round trip costs thousands of them an hour to discover that
 * nothing moved.
 */
export async function recordWorkOrderSources(
  allItems: WorkOrderSourceItem[],
  integrationId: string,
): Promise<void> {
  const items = [
    ...new Map(allItems.map((item) => [item.externalId, item])).values(),
  ];
  if (items.length === 0) return;

  const tickets = await prisma.externalWorkOrderMapping.findMany({
    where: {
      integrationId,
      externalId: { in: items.map((item) => item.externalId) },
    },
    select: { externalId: true, itemId: true },
  });
  const ticketByExternalId = new Map(
    tickets.map((t) => [t.externalId, t.itemId]),
  );

  // A record that the ingest did not land has nothing to attach a snapshot to.
  const landed = items.filter((item) =>
    ticketByExternalId.has(item.externalId),
  );
  if (landed.length === 0) return;

  const lastSynced = new Date();
  const existing = await prisma.externalSourceRecordMapping.findMany({
    where: {
      integrationId,
      externalId: { in: landed.map((item) => item.externalId) },
    },
    select: { id: true, externalId: true },
  });
  const mappingIdByExternalId = new Map(
    existing.map((mapping) => [mapping.externalId, mapping.id]),
  );

  const missing = landed.filter(
    (item) => !mappingIdByExternalId.has(item.externalId),
  );
  if (missing.length > 0) {
    const created =
      await prisma.externalSourceRecordMapping.createManyAndReturn({
        data: missing.map((item) => ({
          integrationId,
          externalId: item.externalId,
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
    item: WorkOrderSourceItem;
    mappingId: string;
    contentHash: string;
  }[] = [];
  for (const item of landed) {
    const mappingId = mappingIdByExternalId.get(item.externalId);
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
      const workOrderTicketId = ticketByExternalId.get(item.externalId);
      if (!sourceRecordId || !workOrderTicketId) return [];
      return [{ sourceRecordId, workOrderTicketId }];
    }),
    skipDuplicates: true,
  });
}
