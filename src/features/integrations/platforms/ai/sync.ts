import "server-only";
import { processAssetIntegrationSync } from "@/features/assets/server/integration-sync";
import { processDeviceArtifactIntegrationSync } from "@/features/device-artifacts/server/integration-sync";
import type { SyncCtx, SyncOutcome } from "@/features/integrations/core/types";
import { processRemediationIntegrationSync } from "@/features/remediations/server/integration-sync";
import { processVulnerabilityIntegrationSync } from "@/features/vulnerabilities/server/integration-sync";
import { ResourceType } from "@/generated/prisma";
import prisma from "@/lib/db";
import type { IntegrationResponse } from "@/lib/schemas";
import { type CrawledItem, runAiCrawler } from "./agent";
import { type CrawlerResource, isCrawlerResource } from "./agent/schemas";
import type { AiConfig, AiCreds } from "./config";

const KNOWN_VENDOR_ID_SAMPLE = 10;

const vendorIdQuery = (integrationId: string) => ({
  where: { integrationId },
  select: { externalId: true },
  orderBy: { updatedAt: "desc" as const },
  take: KNOWN_VENDOR_ID_SAMPLE,
});

/** Where each crawler resource keeps its mappings, and how its items are upserted. */
const CRAWLER_RESOURCES: {
  [R in CrawlerResource]: {
    recentVendorIds: (
      query: ReturnType<typeof vendorIdQuery>,
    ) => Promise<{ externalId: string }[]>;
    ingest: (
      input: { items: CrawledItem<R>[] },
      userId: string,
      integrationId: string,
      options: { shouldRecordSyncOutcome: boolean },
    ) => Promise<IntegrationResponse>;
  };
} = {
  [ResourceType.Asset]: {
    recentVendorIds: (query) => prisma.externalAssetMapping.findMany(query),
    ingest: processAssetIntegrationSync,
  },
  [ResourceType.Vulnerability]: {
    recentVendorIds: (query) =>
      prisma.externalVulnerabilityMapping.findMany(query),
    ingest: processVulnerabilityIntegrationSync,
  },
  [ResourceType.Remediation]: {
    recentVendorIds: (query) =>
      prisma.externalRemediationMapping.findMany(query),
    ingest: processRemediationIntegrationSync,
  },
  [ResourceType.DeviceArtifact]: {
    recentVendorIds: (query) =>
      prisma.externalDeviceArtifactMapping.findMany(query),
    ingest: processDeviceArtifactIntegrationSync,
  },
};

/**
 * Crawl the integration URL with an AI agent, then upsert what it recorded.
 */
export async function aiSync(
  ctx: SyncCtx<AiConfig, AiCreds>,
): Promise<SyncOutcome> {
  const { resource } = ctx;
  if (!isCrawlerResource(resource)) {
    throw new Error(`The AI crawler cannot sync ${resource}`);
  }
  return crawlAndIngest(ctx, resource);
}

// Generic over R so the table lookup keeps crawled items and ingest in step.
async function crawlAndIngest<R extends CrawlerResource>(
  ctx: SyncCtx<AiConfig, AiCreds>,
  resource: R,
): Promise<SyncOutcome> {
  const { recentVendorIds, ingest } = CRAWLER_RESOURCES[resource];

  const known = await recentVendorIds(vendorIdQuery(ctx.integrationId));
  const { items, incomplete } = await runAiCrawler({
    resource,
    integrationUri: ctx.config.integrationUri,
    additionalInstructions: ctx.config.additionalInstructions,
    creds: ctx.creds,
    knownVendorIds: known.map((m) => m.externalId),
  });

  const response = await ingest(
    { items },
    ctx.integrationUserId,
    ctx.integrationId,
    // finalize-sync already records this attempt. A second write double-counts consecutiveFailures.
    { shouldRecordSyncOutcome: false },
  );
  // The items are saved by now. Throwing makes finalize-sync record Error, so a
  // partial crawl or a failed item does not look like a complete sync.
  const problems = [
    incomplete,
    response.shouldRetry ? response.message : undefined,
  ].filter((problem) => problem !== undefined);
  if (problems.length > 0) {
    throw new Error(problems.join(" "));
  }

  return { cursor: ctx.cursor };
}
