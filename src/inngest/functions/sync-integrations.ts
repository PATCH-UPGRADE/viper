import prisma from "@/lib/db";
import { inngest } from "../client";

export const syncAllIntegrations = inngest.createFunction(
  { id: "sync-all-integrations" },
  { cron: "*/1 * * * *" }, // Run every 1 minute
  async ({ step }) => {
    // Get all active integrations
    const integrations = await step.run("fetch-integrations", async () => {
      return prisma.integration.findMany({
        include: {
          syncStatus: {
            orderBy: { syncedAt: "desc" },
            take: 1,
          },
        },
      });
    });

    // Check which integrations need syncing
    const now = new Date();
    const integrationsToSync = integrations.filter((integration) => {
      if (integration.syncStatus.length === 0) {
        return true; // Never synced before
      }

      const lastSync = new Date(integration.syncStatus[0].syncedAt);
      const secondsSinceLastSync = (now.getTime() - lastSync.getTime()) / 1000;

      return secondsSinceLastSync >= integration.syncEvery;
    });

    // Trigger sync for each integration
    await step.sendEvent(
      "trigger-syncs",
      integrationsToSync.map((integration) => ({
        name: "integration/sync.requested",
        data: { integrationId: integration.id },
      })),
    );

    return { syncedCount: integrationsToSync.length };
  },
);

/*
 * TODO: make this actually syncrhonize with the endpoint
 * For now:
 * - Sends a GET request to the integration endpoint
 * - Creates a SyncStatus model
 *
 */

type SyncResult =
  // biome-ignore lint/suspicious/noExplicitAny: data from a server could potentially be any here, that's normal, right?
  { success: true; data: any } | { success: false; errorMessage: string };

export const syncIntegration = inngest.createFunction(
  { id: "sync-integration" },
  { event: "integration/sync.requested" },
  async ({ event, step }) => {
    const { integrationId } = event.data;

    const integration = await step.run("fetch-integration", async () => {
      return prisma.integration.findUnique({
        where: { id: integrationId },
      });
    });

    if (!integration) {
      throw new Error(`Integration ${integrationId} not found`);
    }

    const syncResult = await step.run("fetch-integration-data", async () => {
      try {
        const headers: Record<string, string> = {
          "Content-Type": "application/json",
        };

        if (integration.authType === "Basic") {
          const { username, password } = integration.authentication as {
            username: string;
            password: string;
          };
          const token = Buffer.from(`${username}:${password}`).toString(
            "base64",
          );
          headers.Authorization = `Basic ${token}`;
        } else if (integration.authType === "Bearer") {
          const { token } = integration.authentication as { token: string };
          headers.Authorization = `Bearer ${token}`;
        } else if (integration.authType === "Header") {
          const { header, value } = integration.authentication as {
            header: string;
            value: string;
          };
          headers[header] = value;
        }

        // TODO: modify this for VW-36 / VW-53
        const response = await fetch(integration.integrationUri, {
          method: "GET",
          headers,
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const data = await response.json();
        return { success: true, data } as SyncResult;
      } catch (error) {
        return {
          success: false,
          errorMessage:
            error instanceof Error ? error.message : "Unknown error",
        } as SyncResult;
      }
    });

    await step.run("create-sync-status", async () => {
      await prisma.syncStatus.create({
        data: {
          integrationId: integration.id,
          error: !syncResult.success,
          errorMessage: syncResult.success ? null : syncResult.errorMessage,
          syncedAt: new Date(),
        },
      });

      // Delete old statuses keeping only the 5 most recent
      await prisma.$executeRaw`
    DELETE FROM "SyncStatus"
    WHERE "integrationId" = ${integration.id}
    AND "id" NOT IN (
      SELECT "id"
      FROM "SyncStatus"
      WHERE "integrationId" = ${integration.id}
      ORDER BY "syncedAt" DESC
      LIMIT 5
    )
  `;
    });

    return { success: syncResult.success };
  },
);
