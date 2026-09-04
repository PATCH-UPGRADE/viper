import "server-only";
import { SourceChannel } from "@/generated/prisma";
import { inngest } from "@/inngest/client";
import prisma from "@/lib/db";
import { sourceContentHash } from "@/lib/source-hash";
import type { ResourceSyncCtx, SyncOutcome } from "../../../core/types";
import { listChannels } from "../channels";
import type { MedIsaoConfig, MedIsaoCreds } from "../config";
import { MedIsaoRequestError } from "../paginate";
import { createMedIsaoSession } from "../session";
import {
  type ChannelWatermarks,
  highWaterMark,
  parseCursor,
  sinceFor,
} from "../watermarks";
import { listChanged, type MedIsaoAdvisoryItem } from "./feed";

/**
 * Record what each advisory looked like on this poll.
 *
 * Snapshots are append-only and deduplicate on `contentHash`, so an unchanged
 * advisory costs no write. The mapping owns the snapshots, which keeps the
 * record off the global `(channel, externalId)` unique key that only channels
 * without a mapping use.
 *
 * Returns the ids of the snapshots actually written, so the caller only wakes
 * the pipeline for advisories that moved.
 */
async function recordSnapshots(
  items: MedIsaoAdvisoryItem[],
  integrationId: string,
): Promise<string[]> {
  if (items.length === 0) return [];

  const lastSynced = new Date();
  const externalIds = items.map((item) => item.externalId);

  const existing = await prisma.externalSourceRecordMapping.findMany({
    where: { integrationId, externalId: { in: externalIds } },
    select: { id: true, externalId: true },
  });
  const mappingIdByExternalId = new Map(
    existing.map((mapping) => [mapping.externalId, mapping.id]),
  );

  const missing = items.filter(
    (item) => !mappingIdByExternalId.has(item.externalId),
  );
  if (missing.length > 0) {
    const created =
      await prisma.externalSourceRecordMapping.createManyAndReturn({
        data: missing.map((item) => ({
          integrationId,
          externalId: item.externalId,
          upstreamApi: item.upstreamApi,
          webUrl: item.webUrl,
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
    mappingId: string;
    contentHash: string;
    item: MedIsaoAdvisoryItem;
  }[] = [];
  for (const item of items) {
    const mappingId = mappingIdByExternalId.get(item.externalId);
    if (!mappingId) continue;
    const contentHash = sourceContentHash(item.raw, item.markdown);
    if (newestHashByMappingId.get(mappingId) === contentHash) continue;
    changed.push({ mappingId, contentHash, item });
  }
  if (changed.length === 0) return [];

  const records = await prisma.sourceRecord.createManyAndReturn({
    data: changed.map(({ mappingId, contentHash, item }) => ({
      channel: SourceChannel.Integration,
      mappingId,
      contentHash,
      raw: item.raw,
      markdown: item.markdown,
    })),
    select: { id: true },
  });
  return records.map((record) => record.id);
}

/**
 * Poll every channel this key can see and store the advisories that moved.
 *
 * The classify-and-triage pipeline is not run here. It is several model calls
 * per advisory, and this function shares one sync attempt with every other
 * resource, so each snapshot is handed to its own job with its own retries.
 */
export async function syncAdvisories(
  ctx: ResourceSyncCtx<MedIsaoConfig, MedIsaoCreds>,
): Promise<SyncOutcome> {
  const session = createMedIsaoSession(ctx.creds);
  const { apiUrl } = ctx.config;

  const watermarks = parseCursor(ctx.cursor);
  const nextWatermarks: ChannelWatermarks = { ...watermarks };
  const items: MedIsaoAdvisoryItem[] = [];

  for (const channel of await listChannels(session, apiUrl)) {
    const since = sinceFor(channel.id, watermarks, ctx.lastSuccessfulSync);
    const seen: MedIsaoAdvisoryItem[] = [];

    try {
      for await (const page of listChanged(
        session,
        apiUrl,
        channel.id,
        since,
      )) {
        seen.push(...page);
      }
    } catch (error) {
      // A manufacturer can unpublish a channel or opt a device out between the
      // channel listing and this read. That is a 404 and it is not a fault.
      if (error instanceof MedIsaoRequestError && error.status === 404) {
        console.warn(`MedISAO channel ${channel.id} is no longer visible.`);
        continue;
      }
      throw error;
    }

    items.push(...seen);
    const highest = highWaterMark(
      seen.map((item) => item.updatedAt),
      since,
    );
    if (highest) nextWatermarks[channel.id] = highest.toISOString();
  }

  const newSourceRecordIds = await recordSnapshots(items, ctx.integrationId);

  if (newSourceRecordIds.length > 0) {
    await inngest.send(
      newSourceRecordIds.map((sourceRecordId) => ({
        name: "inbox/source-record.recorded" as const,
        data: { sourceRecordId },
      })),
    );
  }

  // Advance the watermarks only behind a successful write: a throw above leaves
  // the stored cursor alone, so the next attempt re-reads the same window.
  return { cursor: nextWatermarks };
}
