import "server-only";
import { z } from "zod";
import { INTEGRATION_SYNC_EVERY_MIN } from "@/config/constants";
import { integrationAssetInputSchema } from "@/features/assets/types";
import { integrationDeviceArtifactInputSchema } from "@/features/device-artifacts/types";
import type { IntegrationWithStringDates } from "@/features/integrations/types";
import { integrationRemediationInputSchema } from "@/features/remediations/types";
import {
  deriveOffsetFromUrl,
  mapFleetActivities,
} from "@/features/tracking/server/fleet-mapper";
import { integrationWorkOrderInputSchema } from "@/features/tracking/types";
import { integrationVulnerabilityInputSchema } from "@/features/vulnerabilities/types";
import {
  AuthType,
  IntegrationType,
  ResourceType,
  SyncStatusEnum,
} from "@/generated/prisma";
import prisma from "@/lib/db";
import { createUserToken, DEFAULT_TOKEN_TTL_SECONDS } from "@/lib/tokens";
import { getBaseUrl } from "@/lib/url-utils";
import { parseAuthenticationJson } from "@/lib/utils";
import { inngest } from "../client";

export const syncAllIntegrations = inngest.createFunction(
  { id: "sync-all-integrations" },
  { cron: `*/${INTEGRATION_SYNC_EVERY_MIN} * * * *` }, // Run every 5 minutes
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
    if (integrationsToSync.length > 0) {
      await step.sendEvent(
        "trigger-syncs",
        integrationsToSync.map((integration) => ({
          name: "integration/sync.requested",
          data: { integrationId: integration.id },
        })),
      );
    }

    return { syncedCount: integrationsToSync.length };
  },
);

/* Create a new User Token for an integration webhook response. Return the
 * unique reponse path and the schema */
const getResponseConfig = async (
  integrationUserId: string,
  resourceType: ResourceType,
) => {
  // create a user token for the integration user that can only be used for
  // this resource type
  const raw = await createUserToken(
    integrationUserId,
    DEFAULT_TOKEN_TTL_SECONDS,
    resourceType,
  );
  switch (resourceType) {
    case "Asset":
      return {
        path: `/assets/integrationUpload/${raw}`,
        schema: z.toJSONSchema(integrationAssetInputSchema),
      };
    case "DeviceArtifact":
      return {
        path: `/deviceArtifacts/integrationUpload/${raw}`,
        schema: z.toJSONSchema(integrationDeviceArtifactInputSchema),
      };
    case "Remediation":
      return {
        path: `/remediations/integrationUpload/${raw}`,
        schema: z.toJSONSchema(integrationRemediationInputSchema),
      };
    case "Vulnerability":
      return {
        path: `/vulnerabilities/integrationUpload/${raw}`,
        schema: z.toJSONSchema(integrationVulnerabilityInputSchema),
      };
    case "WorkOrder":
      return {
        path: `/workOrders/integrationUpload/${raw}`,
        schema: z.toJSONSchema(integrationWorkOrderInputSchema),
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
  const { schema: responseSchema, path: responsePath } =
    await getResponseConfig(
      integration.integrationUserId,
      integration.resourceType,
    );

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

  const { path: responsePath } = await getResponseConfig(
    integration.integrationUserId,
    integration.resourceType,
  );

  const body = JSON.stringify({
    // TODO: blueflow should be able to handle "null". for now though, if there's no date just send one in the past
    since: integration.lastSuccessfulSync ?? new Date(0).toISOString(),
    max_pages: 1,
    page_size: 500,
    callback: `${getBaseUrl()}/api/v1${responsePath}`,
  });

  const response = await fetch(integration.integrationUri, {
    method: "POST",
    headers,
    signal: AbortSignal.timeout(30000), // 30s timeout
    body,
  });

  if (!response.ok) {
    throw new Error(`Failed to sync data: ${response.statusText}`);
  }

  const data = await response.json();
  return { success: true, data };
}

// Registry of built-in REST adapters, keyed by (URL host, resourceType). The
// integration URL is the authoritative identity of the upstream system —
// unlike the free-text name/platform, it can't drift from what's actually being
// called. `hostMatch` is matched case-insensitively as a substring of the URL's
// hostname. A single host can expose multiple endpoints (e.g. Fleet serves
// activities → WorkOrder and security-advisories → Advisory), so resourceType
// disambiguates which adapter to run.
const REST_MAPPERS: Array<{
  hostMatch: string;
  resourceType: ResourceType;
  map: (raw: unknown, url: string) => unknown[];
}> = [
  {
    hostMatch: "fleet.siemens-healthineers.com",
    resourceType: ResourceType.WorkOrder,
    map: (raw, url) =>
      mapFleetActivities(raw, { offset: deriveOffsetFromUrl(url) }),
  },
];

function selectRestMapper(integration: IntegrationWithStringDates) {
  let host = "";
  try {
    host = new URL(integration.integrationUri).hostname.toLowerCase();
  } catch {
    // Malformed URL → no adapter matches; the caller throws a clear error.
  }
  return REST_MAPPERS.find(
    (m) =>
      m.resourceType === integration.resourceType && host.includes(m.hostMatch),
  );
}

// Helper for REST Integration: the worker pulls the URL itself, maps the
// response with a built-in adapter, then hands the items to the same upload
// endpoint the AI/PARTNER callbacks use (shared dedup + sync-status logic).
async function syncRestIntegration(
  integration: IntegrationWithStringDates,
): Promise<SyncResult> {
  const mapper = selectRestMapper(integration);
  if (!mapper) {
    throw new Error(
      `No REST adapter for integration "${integration.name}" (url: ${integration.integrationUri}, resourceType: ${integration.resourceType})`,
    );
  }

  const headers: Record<string, string> = { Accept: "application/json" };
  if (integration.authType !== AuthType.None) {
    const { header, value } = parseAuthenticationJson(integration);
    headers[header] = value;
  }

  // 1. Pull directly from the REST API.
  const upstream = await fetch(integration.integrationUri, {
    method: "GET",
    headers,
    signal: AbortSignal.timeout(30000),
  });
  if (!upstream.ok) {
    throw new Error(
      `Failed to fetch data: ${upstream.status} ${upstream.statusText}`,
    );
  }
  const rawData = await upstream.json();

  // 2. Map with the platform adapter.
  const items = mapper.map(rawData, integration.integrationUri);

  // 3. Hand off to the token-scoped upload endpoint (token is in the path).
  const { path: responsePath } = await getResponseConfig(
    integration.integrationUserId,
    integration.resourceType,
  );
  const uploadResponse = await fetch(`${getBaseUrl()}/api/v1${responsePath}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal: AbortSignal.timeout(30000),
    body: JSON.stringify({
      items,
      page: 1,
      pageSize: items.length,
      totalCount: items.length,
      totalPages: 1,
      next: null,
      previous: null,
    }),
  });
  if (!uploadResponse.ok) {
    const detail = await uploadResponse.text().catch(() => "");
    throw new Error(
      `Upload failed: ${uploadResponse.status} ${uploadResponse.statusText} ${detail}`.trim(),
    );
  }

  return { success: true, data: await uploadResponse.json() };
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

    // Create PENDING sync status *first* -- Inngest steps are slow, so
    // if we did this afterwards in a separate step, there's a race condition
    // where we could get a webhook callback before Inngest created the status
    const pendingStatus = await step.run("create-sync-status", async () => {
      return prisma.syncStatus.create({
        data: {
          integrationId: integration.id,
          status: SyncStatusEnum.Pending,
          syncedAt: new Date(),
        },
      });
    });

    const syncResult = await step.run("fetch-integration-data", async () => {
      try {
        if (integration.integrationType === IntegrationType.AI) {
          return await syncAiIntegration(integration);
        } else if (integration.integrationType === IntegrationType.PARTNER) {
          return await syncPartnerIntegration(integration);
        } else if (integration.integrationType === IntegrationType.REST) {
          return await syncRestIntegration(integration);
        } else if (integration.integrationType === IntegrationType.CSAF) {
          throw "TODO: VW-227";
        } else {
          throw "Invalid integration type";
        }
      } catch (error) {
        return {
          success: false,
          errorMessage:
            error instanceof Error ? error.message : "Unknown error",
        } as SyncResult;
      }
    });

    await step.run("finalize-sync-status", async () => {
      // If the sync request failed to trigger entirely, update this run's
      // specific status record to ERROR (no webhook callback will fire).
      if (!syncResult.success) {
        await prisma.syncStatus.updateMany({
          where: {
            id: pendingStatus.id,
            status: SyncStatusEnum.Pending,
          },
          data: {
            status: SyncStatusEnum.Error,
            errorMessage: syncResult.errorMessage,
          },
        });
      }

      // Keep only the 5 most recent statuses
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
