import "server-only";
import type {
  ResourceSyncCtx,
  SyncOutcome,
} from "@/features/integrations/core/types";
import { SourceChannel } from "@/generated/prisma";
import prisma from "@/lib/db";
import { sourceContentHash } from "@/lib/source-hash";
import type { FleetConfig, FleetCreds } from "../config";
import { createFleetSession } from "../session";
import {
  type FleetAdvisoryItem,
  hashableOf,
  listChanged,
  toCanonical,
} from "./advisories";

/**
 * Record what each active advisory looked like on this poll.
 *
 * Snapshots are append-only and deduplicate on `contentHash`, so an unchanged
 * advisory costs no write. The mapping owns the snapshots, which keeps the
 * record off the global `(channel, externalId)` unique key that only channels
 * without a mapping use.
 *
 * Fleet cannot filter its advisories by change, so every poll carries the whole
 * collection. The work is therefore batched into a fixed number of queries, the
 * same shape `work-orders/sync.ts` uses for activities: a per-advisory round
 * trip would spend hundreds of them an hour to discover that nothing moved.
 */
async function recordAdvisories(
  items: FleetAdvisoryItem[],
  integrationId: string,
): Promise<void> {
  if (items.length === 0) return;

  const lastSynced = new Date();
  const existing = await prisma.externalSourceRecordMapping.findMany({
    where: {
      integrationId,
      externalId: { in: items.map((item) => item.vendorId) },
    },
    select: { id: true, externalId: true },
  });
  const mappingIdByExternalId = new Map(
    existing.map((mapping) => [mapping.externalId, mapping.id]),
  );

  const missing = items.filter(
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
  // Stamped even for advisories that did not change: it records that we polled.
  const existingIds = existing.map((mapping) => mapping.id);
  if (existingIds.length > 0) {
    await prisma.externalSourceRecordMapping.updateMany({
      where: { id: { in: existingIds } },
      data: { lastSynced },
    });
  }

  // Newest snapshot per mapping in one query, so the hash comparison below
  // needs no further round trips. Only the mappings that already existed can
  // have a snapshot, so the ones created just above are left out of the `in`.
  const newest = await prisma.sourceRecord.findMany({
    where: { mappingId: { in: existingIds } },
    orderBy: [{ mappingId: "asc" }, { observedAt: "desc" }],
    distinct: ["mappingId"],
    select: { mappingId: true, contentHash: true },
  });
  const newestHashByMappingId = new Map(
    newest.map((record) => [record.mappingId, record.contentHash]),
  );

  const changed: {
    item: FleetAdvisoryItem;
    mappingId: string;
    contentHash: string;
  }[] = [];
  for (const item of items) {
    const mappingId = mappingIdByExternalId.get(item.vendorId);
    if (!mappingId) continue;
    // `hashableOf` drops enableMail / lastEmailsSent, which describe Fleet's
    // subscriber mailing rather than the advisory: a mail going out must not
    // read as a new revision.
    const contentHash = sourceContentHash(hashableOf(item.raw), item.body);
    if (newestHashByMappingId.get(mappingId) === contentHash) continue;
    changed.push({ item, mappingId, contentHash });
  }
  if (changed.length === 0) return;

  await prisma.sourceRecord.createMany({
    data: changed.map(({ item, mappingId, contentHash }) => ({
      channel: SourceChannel.Integration,
      mappingId,
      contentHash,
      raw: item.raw,
      markdown: item.body,
    })),
  });
}

export async function syncAdvisories(
  ctx: ResourceSyncCtx<FleetConfig, FleetCreds>,
): Promise<SyncOutcome> {
  const session = await createFleetSession(ctx.creds);

  // Keyed by vendorId so one advisory appearing twice in a response is carried
  // once. A repeat would otherwise write two identical snapshots, because the
  // hash comparison reads the newest stored record and cannot see a sibling
  // created in the same pass.
  const byVendorId = new Map<string, FleetAdvisoryItem>();
  for await (const page of listChanged(session, ctx.cursor)) {
    for (const raw of page.items) {
      const item = toCanonical(raw);
      byVendorId.set(item.vendorId, item);
    }
  }

  // Throwing makes finalize-sync record Error.
  await recordAdvisories([...byVendorId.values()], ctx.integrationId);

  // No cursor, advisories endpoint cannot paginate
  return { cursor: null };
}
