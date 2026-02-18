import "server-only";
import { z } from "zod";
import { integrationAssetInputSchema } from "@/features/assets/server/routers";
import { integrationDeviceArtifactInputSchema } from "@/features/device-artifacts/server/routers";
import type { IntegrationWithStringDates } from "@/features/integrations/types";
import { integrationRemediationInputSchema } from "@/features/remediations/server/routers";
import { integrationVulnerabilityInputSchema } from "@/features/vulnerabilities/server/routers";
import type { ResourceType } from "@/generated/prisma";
import { AuthType, SyncStatusEnum } from "@/generated/prisma";
import { auth } from "@/lib/auth";
import prisma from "@/lib/db";
import { getBaseUrl } from "@/lib/url-utils";
import { parseAuthenticationJson } from "@/lib/utils";
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

const getResponseConfig = (resourceType: ResourceType) => {
  switch (resourceType) {
    case "Asset":
      return {
        path: "/assets/integrationUpload",
        schema: z.toJSONSchema(integrationAssetInputSchema),
      };
    case "DeviceArtifact":
      return {
        path: "/deviceArtifacts/integrationUpload",
        schema: z.toJSONSchema(integrationDeviceArtifactInputSchema),
      };
    case "Remediation":
      return {
        path: "/remediations/integrationUpload",
        schema: z.toJSONSchema(integrationRemediationInputSchema),
      };
    case "Vulnerability":
      return {
        path: "/vulnerabilities/integrationUpload",
        schema: z.toJSONSchema(integrationVulnerabilityInputSchema),
      };
    default:
      throw new Error(`Unhandled ResourceType: ${resourceType}`);
  }
};

type SyncResult =
  // biome-ignore lint/suspicious/noExplicitAny: data from a server could potentially be any here, that's normal, right?
  { success: true; data: any } | { success: false; errorMessage: string };

// Helper function for AI Integration
async function syncAiIntegration(
  integration: IntegrationWithStringDates,
): Promise<SyncResult> {
  const n8nWebhookUrl = process.env.N8N_AI_SYNC_URL;
  const n8nKey = process.env.N8N_KEY;

  if (!n8nKey || !n8nWebhookUrl) {
    throw new Error("Either N8N_KEY or N8N_AI_SYNC_URL is not defined");
  }

  // get where n8n should respond, and what schema it should respond with
  const { schema: responseSchema, path: responsePath } = getResponseConfig(
    integration.resourceType,
  );

  // generate an api key for the response
  // TODO: this probably isn't great auth, use HMAC and a webhook secret later on
  // put the integration user id in the payload
  const apiKey = await auth.api.createApiKey({
    body: {
      userId: integration.userId,
      name: "n8n response api key",
      // we cannot create api keys that are shorter than 24 hrs
      expiresIn: 60 * 60 * 24,
      rateLimitEnabled: false,
    },
  });

  // update integration with new key
  await prisma.integration.update({
    where: { id: integration.id },
    data: { apiKeyId: apiKey.id },
  });

  const response = await fetch(n8nWebhookUrl, {
    method: "POST",
    headers: {
      Authorization: n8nKey,
      "Content-Type": "application/json",
    },
    signal: AbortSignal.timeout(30000), // 30s timeout
    body: JSON.stringify({
      // If you're testing this locally and need webhooks, use NEXT_PUBLIC_APP_URL
      baseApiUrl: `${getBaseUrl()}/api/v1`,
      responseApiKey: apiKey.key, // TODO: eventually switch to tokens or webhook secrets
      responsePath,
      responseSchema,
      resourceType: integration.resourceType,
      integrationUri: integration.integrationUri,
      additionalInstructions: integration.prompt,
      authType: integration.authType,
      authentication: integration.authentication,
    }),
  });

  if (!response.ok) {
    throw new Error(`Failed to sync data: ${response.statusText}`);
  }

  const data = await response.json();
  return { success: true, data };
}

// Helper function for Partner Integration
async function syncPartnerIntegration(
  integration: IntegrationWithStringDates,
): Promise<SyncResult> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (integration.authType !== AuthType.None) {
    const { header, value } = parseAuthenticationJson(integration);
    headers[header] = value;
  }

  const { path: responsePath } = getResponseConfig(integration.resourceType);

  const response = await fetch(integration.integrationUri, {
    method: "POST",
    headers,
    signal: AbortSignal.timeout(30000), // 30s timeout
    body: JSON.stringify({
      last_sync: "TODO", // TODO: VW-36
      page: 1,
      pageSize: 500,
      webhook_url: `${getBaseUrl()}/api/v1${responsePath}`,
    }),
  });

  if (!response.ok) {
    throw new Error(`Failed to sync data: ${response.statusText}`);
  }

  const data = await response.json();
  return { success: true, data };
}

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
        if (integration.isGeneric) {
          return await syncAiIntegration(integration);
        } else {
          return await syncPartnerIntegration(integration);
        }
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
          status: !syncResult.success
            ? SyncStatusEnum.Error
            : SyncStatusEnum.Pending,
          errorMessage: syncResult.success ? null : syncResult.errorMessage,
          syncedAt: new Date(),
        },
      });

      // Delete old statuses keeping only the 5 most recent
      await prisma.$executeRaw`
        DELETE FROM "sync_status"
        WHERE "integrationId" = ${integration.id}
        AND "id" NOT IN (
          SELECT "id"
          FROM "sync_status"
          WHERE "integrationId" = ${integration.id}
          ORDER BY "syncedAt" DESC
          LIMIT 5
        )
      `;
    });

    return { success: syncResult.success };
  },
);
