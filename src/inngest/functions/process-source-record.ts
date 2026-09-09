// An integration sync records a SourceRecord -> this function
// Turns one stored snapshot into a linked, triaged Notification.

import "server-only";
import { runNotificationPipeline } from "@/features/inbox/pipeline";
import { sourceAdapterFor } from "@/features/integrations/core/registry";
import prisma from "@/lib/db";
import { inngest } from "../client";

/**
 * Platform-agnostic on purpose, the same way `sync-integrations` is.
 *
 * A snapshot knows its mapping, a mapping knows its integration, and an
 * integration names its platform. The platform's notifications module says what
 * its own `raw` means. So this function never branches on which platform it is
 * holding, and a second advisory source needs no change here.
 */
export const processSourceRecord = inngest.createFunction(
  { id: "process-source-record" },
  { event: "inbox/source-record.recorded" },
  async ({ event, step }) => {
    const { sourceRecordId } = event.data as { sourceRecordId: string };

    const snapshot = await step.run("load-source-record", async () => {
      const record = await prisma.sourceRecord.findUnique({
        where: { id: sourceRecordId },
        select: {
          raw: true,
          // A snapshot is linked by the pipeline itself, so a link means this
          // work already ran to completion.
          links: { select: { id: true }, take: 1 },
          mapping: {
            select: { integration: { select: { platform: true } } },
          },
        },
      });
      if (!record) throw new Error(`No SourceRecord ${sourceRecordId}`);
      if (!record.mapping) {
        // Email and TA4 snapshots have no mapping, and neither arrives here.
        throw new Error(
          `SourceRecord ${sourceRecordId} has no integration mapping`,
        );
      }
      return {
        raw: record.raw,
        platform: record.mapping.integration.platform,
        alreadyProcessed: record.links.length > 0,
      };
    });

    // The sync re-emits any snapshot that never became a Notification, so the
    // same snapshot can arrive twice while its first run is still going. The
    // event carries an idempotency key, but that is the queue's promise rather
    // than ours, and a second run would pay for the agents all over again.
    if (snapshot.alreadyProcessed) {
      return { sourceRecordId, skipped: "already-processed" as const };
    }

    const adapter = sourceAdapterFor(snapshot.platform);
    if (!adapter) {
      // Saying so beats a snapshot that sits unprocessed forever: a platform
      // that records snapshots but declares no adapter is a registration bug.
      throw new Error(
        `Platform ${snapshot.platform} records source snapshots but declares no SourceRecordAdapter`,
      );
    }

    const { doc, linkEntities } = adapter.prepare(snapshot.raw);

    const result = await runNotificationPipeline({
      step,
      sourceId: sourceRecordId,
      doc,
      linkEntities,
    });

    return { sourceRecordId, platform: snapshot.platform, ...result };
  },
);
