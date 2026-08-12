import "server-only";
import { NonRetriableError } from "inngest";
import { INTEGRATION_SYNC_EVERY_MIN } from "@/config/constants";
import { createCallback } from "@/features/integrations/core/callback";
import {
  decryptCredentials,
  parseAuthCredential,
} from "@/features/integrations/core/credentials";
import {
  defaultSyncEveryFor,
  requirePlatform,
} from "@/features/integrations/core/registry";
import {
  computeNextSyncAt,
  effectiveSyncEvery,
} from "@/features/integrations/core/sync/cadence";
import type { SyncCtx } from "@/features/integrations/core/types";
import { Prisma, SyncStatusEnum } from "@/generated/prisma";
import prisma from "@/lib/db";
import { inngest } from "../client";

/**
 * The two Inngest functions that drive integration syncs.
 */

export const syncAllIntegrations = inngest.createFunction(
  { id: "sync-all-integrations" },
  { cron: `*/${INTEGRATION_SYNC_EVERY_MIN} * * * *` }, // Run every 5 minutes
  async ({ step }) => {
    // The unit of work is (integration, resource), not the integration. Three
    // separate facts get three separate columns:
    //   integration.enabled  — the whole connection is switched off
    //   resourceSync.enabled — this one resource is switched off
    //   nextSyncAt           — when this resource is next due (null = due now)
    //
    // The old predicate compared `now - newestSyncStatus.syncedAt` against
    // syncEvery *regardless of that row's state*, so a Pending row that never
    // completed suppressed re-sync forever. nextSyncAt is stamped at attempt
    // start instead, so a crashed worker costs one cycle rather than wedging.
    //
    // Every due row is scheduled, whatever its platform does with the tick.
    // A platform with no module registered is scheduled too, on purpose: it
    // then records a real error on its resource row, which is where an operator
    // would look, instead of sitting `Pending` forever with nothing to see.
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
    // A manual "Sync Now" and the cron could previously run the same
    // integration twice at once. The unit of work is (integration, resource).
    concurrency: {
      key: "event.data.integrationId + event.data.resource",
      limit: 1,
    },
  },
  { event: "integration/sync.requested" },
  async ({ event, step }) => {
    const { integrationId, resource } = event.data;

    // ---- 1. Load ---------------------------------------------------------
    // Only JSON-safe, non-secret facts leave this step. `credentials` is
    // omitted deliberately: a step's return value is shipped to and memoized by
    // the Inngest service, so returning decrypted credentials would store
    // plaintext outside the process. Step 3 re-reads and decrypts in-process.
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
      // Retrying a deleted integration four times helps nobody.
      throw new NonRetriableError(`Integration ${integrationId} not found`);
    }

    // ---- 2. Claim the attempt, before doing any work ---------------------
    // Stamping lastAttemptAt and pushing nextSyncAt forward first means a
    // worker that crashes mid-sync costs one cycle instead of wedging the row
    // on a stuck Pending. It also closes the old race where a callback could
    // land before the status row existed.
    await step.run("claim-attempt", async () => {
      const seconds = effectiveSyncEvery(
        loaded.resourceSyncEvery,
        loaded.syncEvery,
        // A registry read, but only a number crosses the boundary.
        defaultSyncEveryFor(loaded.platform, resource),
      );
      const nextSyncAt = computeNextSyncAt(seconds, loaded.consecutiveFailures);

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
    });

    // ---- 3. Run the strategy ---------------------------------------------
    // One step, not several. `step.run` memoizes its return value as JSON, so a
    // closure or a module cannot cross a boundary. Everything non-serializable
    // is therefore created and consumed in here; only `{ ok, cursor, pending }`
    // comes out.
    const outcome = await step.run("run-sync-strategy", async () => {
      try {
        // Inside the try on purpose: an unregistered platform then produces an
        // errorMessage the operator can see, instead of an uncaught throw that
        // would skip step 4 entirely.
        const module = requirePlatform(loaded.platform);
        const config = module.definition.configSchema.parse(loaded.config);

        const row = await prisma.integration.findUnique({
          where: { id: integrationId },
          select: { credentials: true },
        });
        const creds = module.definition.credentialSchema.parse(
          parseAuthCredential(
            row?.credentials ? decryptCredentials(row.credentials) : null,
            integrationId,
          ),
        );

        const ctx: SyncCtx = {
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
      if (outcome.pending) return;

      await prisma.integrationResourceSync.update({
        where: { integrationId_resource: { integrationId, resource } },
        data: {
          status: SyncStatusEnum.Success,
          errorMessage: null,
          lastSuccessfulSync: new Date(),
          consecutiveFailures: 0,
          // A Json? column needs DbNull to be cleared; plain null is a type error.
          cursor:
            outcome.cursor === null
              ? Prisma.DbNull
              : (outcome.cursor as Prisma.InputJsonValue),
        },
      });

      // The old 5-row prune is gone with SyncStatus: there is now exactly one
      // durable row per (integration, resource), so there is nothing to trim.
    });

    return { success: outcome.ok, pending: outcome.ok && outcome.pending };
  },
);
