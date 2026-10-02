import "server-only";
import { z } from "zod";
import { Prisma, SourceChannel } from "@/generated/prisma";
import prisma from "@/lib/db";
import { sourceContentHash } from "@/lib/source-hash";
import { dispatchUnprocessedSnapshots } from "../../../core/source-records";
import type {
  Cursor,
  ResourceSyncCtx,
  Session,
  SyncOutcome,
} from "../../../core/types";
import type { CsafConfig, CsafCreds } from "../config";
import {
  type CsafAdvisoryItem,
  type CsafDocument,
  csafDocumentSchema,
} from "../document";
import { toMarkdown } from "../markdown";
import { feedsOf, fetchProviderMetadata } from "../provider-metadata";
import { type FeedEntry, fetchFeed } from "../rolie";
import { MAX_DOC_BYTES, readCapped } from "../session";

interface FeedCursor {
  etag?: string;
  seen: Record<string, string>;
  pending?: FeedEntry[];
}
interface CsafCursor {
  feeds: Record<string, FeedCursor>;
}

const MAX_DOC_PER_RUN = 10;

const parseCursor = (cursor: Cursor | null): CsafCursor => {
  const parsed = z
    .object({
      feeds: z.record(
        z.string(),
        z.object({
          etag: z.string().optional(),
          seen: z.record(z.string(), z.string()),
        }),
      ),
    })
    .safeParse(cursor);
  return parsed.success ? parsed.data : { feeds: {} };
};

const seenMapOf = (entries: FeedEntry[]): Record<string, string> =>
  Object.fromEntries(entries.map((e) => [e.id, String(e.updatedAt)]));

interface Downloaded extends CsafAdvisoryItem {
  entry: FeedEntry;
  doc: CsafDocument;
}

const syncAll = async (
  session: Session,
  entries: FeedEntry[],
): Promise<Downloaded[]> => {
  const items: Downloaded[] = [];

  for (const entry of entries) {
    try {
      const response = await session.request(entry.documentUrl);
      if (!response.ok) {
        throw new Error(
          `${entry.documentUrl}` + ` returned ${response.status}`,
        );
      }
      const body = await readCapped(response, MAX_DOC_BYTES, entry.id);
      const raw = JSON.parse(body.toString("utf-8"));
      const doc = csafDocumentSchema.parse(raw);
      items.push({
        trackingId: doc.document.tracking.id,
        documentUrl: entry.documentUrl,
        webUrl: webUrlOf(doc),
        entry,
        raw,
        doc,
        markdown: toMarkdown(doc),
      });
    } catch (error) {
      console.warn(`csaf: skipping ${entry.id}`, error);
    }
  }
  return items;
};

const webUrlOf = (doc: CsafDocument): string | undefined =>
  doc.document.references.find(
    (ref) => ref.category === "self" && !ref.url.endsWith(".json"),
  )?.url;

const recordSnapshots = async (
  items: Downloaded[],
  integrationId: string,
): Promise<void> => {
  if (items.length === 0) return;
  const externalIds = items.map((item) => item.trackingId);

  const existing = await prisma.externalSourceRecordMapping.findMany({
    where: { integrationId, externalId: { in: externalIds } },
    select: { id: true, externalId: true },
  });
  const mappingByExternalId = new Map(
    existing.map((mapping) => [mapping.externalId, mapping.id]),
  );
  const unmapped = items.filter(
    (item) => !mappingByExternalId.has(item.trackingId),
  );
  if (unmapped.length > 0) {
    const created =
      await prisma.externalSourceRecordMapping.createManyAndReturn({
        data: unmapped.map((item) => ({
          integrationId,
          externalId: item.trackingId,
          upstreamApi: item.documentUrl,
          webUrl: item.webUrl,
        })),
        select: { id: true, externalId: true },
      });
    for (const mapping of created) {
      mappingByExternalId.set(mapping.externalId, mapping.id);
    }
  }
  if (existing.length > 0) {
    await prisma.externalSourceRecordMapping.updateMany({
      where: { id: { in: existing.map((mapping) => mapping.id) } },
      data: { lastSynced: new Date() },
    });
  }

  const newest = await prisma.sourceRecord.findMany({
    where: { mappingId: { in: [...mappingByExternalId.values()] } },
    distinct: ["mappingId"],
    orderBy: [{ mappingId: "asc" }, { observedAt: "desc" }],
    select: { mappingId: true, contentHash: true },
  });

  const newestHashByMapping = new Map(
    newest.map((snapshot) => [snapshot.mappingId, snapshot.contentHash]),
  );
  const changed = items.flatMap((item) => {
    const mappingId = mappingByExternalId.get(item.trackingId);
    if (!mappingId) return [];

    const contentHash = sourceContentHash(item.raw, item.markdown);
    if (newestHashByMapping.get(mappingId) === contentHash) return [];

    return [
      {
        channel: SourceChannel.Integration,
        mappingId,
        contentHash,
        raw: item.raw as Prisma.InputJsonValue,
        markdown: item.markdown,
      },
    ];
  });
  if (changed.length > 0) {
    await prisma.sourceRecord.createMany({ data: changed });
  }
};

export const syncAdvisories = async (
  ctx: ResourceSyncCtx<CsafConfig, CsafCreds>,
): Promise<SyncOutcome> => {
  const { session } = ctx;
  const metadata = await fetchProviderMetadata(
    session,
    ctx.config.providerMetadataUrl,
  );
  const cursor = parseCursor(ctx.cursor);

  for (const feed of feedsOf(metadata)) {
    const feedUrl = feed.url;
    const firstRun = !cursor.feeds[feedUrl];
    const state = cursor.feeds[feedUrl] ?? { seen: {} };
    cursor.feeds[feedUrl] = state;

    const result = await fetchFeed(session, feedUrl, state?.etag);
    if ("unchanged" in result) {
      continue;
    }
    // if (firstRun) {
    //   state.seen = seenMapOf(result.entries);
    //   const newest = [...result.entries]
    //     .sort((a, b) => a.updatedAt - b.updatedAt)
    //     .slice(firstBudgetRun);
    //   for (const entry of newest) delete state.seen[entry.id];
    // }
    // if (!state) {
    //   const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
    //   cursor.feeds[feedUrl] = {
    //     etag: result.etag,
    //     seen: seenMapOf(result.entries.filter((e) => e.updatedAt < cutoff)),
    //   };
    //   continue;
    // }
    const candidates = result.entries
      .filter((entry) => state.seen[entry.id] !== String(entry.updatedAt))
      .sort((a, b) => a.updatedAt - b.updatedAt)
      .slice(0, MAX_DOC_PER_RUN);

    const items = await syncAll(session, candidates);
    const wanted = items.filter(
      (item) => item.doc.document.tracking.status !== "draft",
    );

    await recordSnapshots(wanted, ctx.integrationId);

    for (const item of items) {
      state.seen[item.entry.id] = String(item.entry.updatedAt);
    }
    state.etag = result.etag;

    await dispatchUnprocessedSnapshots(
      ctx.integrationId,
      wanted.map((item) => item.trackingId),
    );
  }
  return { cursor };
};
