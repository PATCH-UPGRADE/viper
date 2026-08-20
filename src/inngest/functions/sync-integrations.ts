import "server-only";
import { NonRetriableError } from "inngest";
import { INTEGRATION_SYNC_EVERY_MIN } from "@/config/constants";
import { createCallback } from "@/features/integrations/core/callback";
import { decryptCredentials } from "@/features/integrations/core/credentials";
import {
  defaultSyncEveryFor,
  requirePlatform,
} from "@/features/integrations/core/registry";
import {
  computeNextSyncAt,
  effectiveSyncEvery,
} from "@/features/integrations/core/sync/cadence";
import type { SyncCtx } from "@/features/integrations/core/types";
import { AuthType, Prisma, SyncStatusEnum } from "@/generated/prisma";
import prisma from "@/lib/db";
import { inngest } from "../client";

/**
 * The two Inngest functions that drive integration syncs.
 * TODO VW-437: Document in a CLAUDE.md file somewhere that adding a platform
 *    should not make changes to this file
 */

export const syncAllIntegrations = inngest.createFunction(
  { id: "sync-all-integrations" },
  { cron: `*/${INTEGRATION_SYNC_EVERY_MIN} * * * *` }, // Run every 5 minutes
  async ({ step }) => {
    //  integration.enabled  — the whole connection is switched off
    //  resourceSync.enabled — this one resource is switched off
    //  nextSyncAt           — when this resource is next due (null = due now)
    //
    // Every due row is scheduled, whatever its platform does with the tick.
    const due = await step.run("fetch-due-resource-syncs", async () =>
      prisma.integrationResourceSync.findMany({
        where: {
          enabled: true,
          integration: { enabled: true },
          OR: [{ nextSyncAt: null }, { nextSyncAt: { lte: new Date() } }],
        },
        select: { integrationId: true, resource: true },
      }),
    );

    if (due.length > 0) {
      await step.sendEvent(
        "trigger-syncs",
        due.map((sync) => ({
          name: "integration/sync.requested" as const,
          data: { integrationId: sync.integrationId, resource: sync.resource },
        })),
      );
    }

    return { syncedCount: due.length };
  },
);

export const syncIntegration = inngest.createFunction(
  {
    id: "sync-integration",
    concurrency: {
      key: "event.data.integrationId + event.data.resource",
      limit: 1,
    },
  },
  { event: "integration/sync.requested" },
  async ({ event, step }) => {
    const { integrationId, resource } = event.data;

    // ---- 1. Load ---------------------------------------------------------
    // Only JSON-safe, non-secret facts leave this step.
    const loaded = await step.run("load-integration", async () => {
      const integration = await prisma.integration.findUnique({
        where: { id: integrationId },
        omit: { credentials: true },
        include: { resourceSyncs: { where: { resource } } },
      });
      if (!integration) return null;

      const resourceSync = integration.resourceSyncs[0] ?? null;
      return {
        platform: integration.platform,
        integrationUserId: integration.integrationUserId,
        syncEvery: integration.syncEvery,
        // Raw JSON. Step 3 narrows it with the platform's own configSchema.
        config: integration.config,
        cursor: (resourceSync?.cursor ?? null) as unknown,
        // Dates cross the step boundary as strings; step 3 rehydrates.
        lastSuccessfulSync:
          resourceSync?.lastSuccessfulSync?.toISOString() ?? null,
        consecutiveFailures: resourceSync?.consecutiveFailures ?? 0,
        resourceSyncEvery: resourceSync?.syncEvery ?? null,
      };
    });

    if (!loaded) {
      throw new NonRetriableError(`Integration ${integrationId} not found`);
    }

    // ---- 2. Claim the attempt, before doing any work ---------------------
    // Compute when to sync next so that if we get an error, we know when to
    // retry
    const { seconds } = await step.run("claim-attempt", async () => {
      const seconds = effectiveSyncEvery(
        loaded.resourceSyncEvery,
        loaded.syncEvery,
        // A registry read, but only a number crosses the boundary.
        defaultSyncEveryFor(loaded.platform, resource),
      );
      // `consecutiveFailures` is only incremented in step 4, so it doesn't yet
      // count the attempt being scheduled here. Add it, or every failure's
      // penalty would land one attempt late and the first would not back off.
      const nextSyncAt = computeNextSyncAt(
        seconds,
        loaded.consecutiveFailures + 1,
      );

      await prisma.integrationResourceSync.upsert({
        where: { integrationId_resource: { integrationId, resource } },
        create: {
          integrationId,
          resource,
          status: SyncStatusEnum.Pending,
          lastAttemptAt: new Date(),
          nextSyncAt,
        },
        update: {
          status: SyncStatusEnum.Pending,
          errorMessage: null,
          lastAttemptAt: new Date(),
          nextSyncAt,
        },
      });

      return { seconds };
    });

    // ---- 3. Run the strategy ---------------------------------------------
    const outcome = await step.run("run-sync-strategy", async () => {
      try {
        const module = requirePlatform(loaded.platform);
        const config = module.definition.configSchema.parse(loaded.config);

        const row = await prisma.integration.findUnique({
          where: { id: integrationId },
          select: { credentials: true },
        });
        const creds = module.definition.credentialSchema.parse(
          row?.credentials
            ? decryptCredentials(row.credentials)
            : { authType: AuthType.None },
        );

        const ctx: SyncCtx = {
          integrationId,
          config,
          creds,
          resource,
          cursor: loaded.cursor,
          lastSuccessfulSync: loaded.lastSuccessfulSync
            ? new Date(loaded.lastSuccessfulSync)
            : null,
          callback: () => createCallback(loaded.integrationUserId, resource),
        };

        const result = await module.sync(ctx);
        return {
          ok: true as const,
          cursor: (result.cursor ?? null) as unknown,
          pending: result.pending ?? false,
        };
      } catch (error) {
        return {
          ok: false as const,
          errorMessage:
            error instanceof Error ? error.message : "Unknown error",
        };
      }
    });

    // ---- 4. Persist the outcome ------------------------------------------
    await step.run("finalize-sync", async () => {
      if (!outcome.ok) {
        await prisma.integrationResourceSync.update({
          where: { integrationId_resource: { integrationId, resource } },
          data: {
            status: SyncStatusEnum.Error,
            errorMessage: outcome.errorMessage,
            consecutiveFailures: { increment: 1 },
          },
        });
        return;
      }

      // A push platform hands off rather than fetching: the work finishes when
      // the callback lands, so a successful hand-off stays Pending for
      // `upsertResourceSync` to close out. Only a failed hand-off is terminal
      // here, because no callback will ever fire for one.
      //
      // The status is left alone, but the schedule still needs clearing: step 2
      // claimed this attempt assuming it would fail, and `upsertResourceSync`
      // never writes `nextSyncAt`. Without this a healthy push platform would
      // tick at twice its configured interval, forever.
      if (outcome.pending) {
        await prisma.integrationResourceSync.update({
          where: { integrationId_resource: { integrationId, resource } },
          data: { nextSyncAt: computeNextSyncAt(seconds, 0) },
        });
        return;
      }

      await prisma.integrationResourceSync.update({
        where: { integrationId_resource: { integrationId, resource } },
        data: {
          status: SyncStatusEnum.Success,
          errorMessage: null,
          lastSuccessfulSync: new Date(),
          consecutiveFailures: 0,
          // Step 2 claimed this attempt with a backed-off `nextSyncAt`, and
          // nothing else rewrites it. Clearing the backoff here is what puts a
          // recovered resource back on its normal interval instead of making
          // it serve out the penalty for failures it just recovered from.
          nextSyncAt: computeNextSyncAt(seconds, 0),
          // A Json? column needs DbNull to be cleared; plain null is a type error.
          cursor:
            outcome.cursor === null
              ? Prisma.DbNull
              : (outcome.cursor as Prisma.InputJsonValue),
        },
      });
    });

    return { success: outcome.ok, pending: outcome.ok && outcome.pending };
  },
);
