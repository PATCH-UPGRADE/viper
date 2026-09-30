import "server-only";
import { processAssetIntegrationSync } from "@/features/assets/server/integration-sync";
import { processDeviceArtifactIntegrationSync } from "@/features/device-artifacts/server/integration-sync";
import type { SyncCtx, SyncOutcome } from "@/features/integrations/core/types";
import { processRemediationIntegrationSync } from "@/features/remediations/server/integration-sync";
import { processVulnerabilityIntegrationSync } from "@/features/vulnerabilities/server/integration-sync";
import { ResourceType } from "@/generated/prisma";
import prisma from "@/lib/db";
import type { IntegrationResponse } from "@/lib/schemas";
import { runAiCrawler } from "./agent";
import { type CrawlerResource, isCrawlerResource } from "./agent/schemas";
import type { AiConfig, AiCreds } from "./config";

const KNOWN_VENDOR_ID_SAMPLE = 10;

function recentVendorIds(
  resource: CrawlerResource,
  integrationId: string,
): Promise<{ externalId: string }[]> {
  const query = {
    where: { integrationId },
    select: { externalId: true },
    orderBy: { updatedAt: "desc" as const },
    take: KNOWN_VENDOR_ID_SAMPLE,
  };
  switch (resource) {
    case ResourceType.Asset:
      return prisma.externalAssetMapping.findMany(query);
    case ResourceType.Vulnerability:
      return prisma.externalVulnerabilityMapping.findMany(query);
    case ResourceType.Remediation:
      return prisma.externalRemediationMapping.findMany(query);
    case ResourceType.DeviceArtifact:
      return prisma.externalDeviceArtifactMapping.findMany(query);
  }
}

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

  const known = await recentVendorIds(resource, ctx.integrationId);
  const crawl = {
    integrationUri: ctx.config.integrationUri,
    additionalInstructions: ctx.config.additionalInstructions,
    creds: ctx.creds,
    knownVendorIds: known.map((m) => m.externalId),
  };
  const target = [
    ctx.integrationUserId,
    ctx.integrationId,
    // finalize-sync already records this attempt. A second write double-counts consecutiveFailures.
    { shouldRecordSyncOutcome: false },
  ] as const;

  let incomplete: string | undefined;
  const crawlItems = async <R extends CrawlerResource>(resource: R) => {
    const result = await runAiCrawler({ ...crawl, resource });
    incomplete = result.incomplete;
    return result.items;
  };

  const ingest = async (): Promise<IntegrationResponse> => {
    switch (resource) {
      case ResourceType.Asset:
        return processAssetIntegrationSync(
          { items: await crawlItems(resource) },
          ...target,
        );
      case ResourceType.Vulnerability:
        return processVulnerabilityIntegrationSync(
          { items: await crawlItems(resource) },
          ...target,
        );
      case ResourceType.Remediation:
        return processRemediationIntegrationSync(
          { items: await crawlItems(resource) },
          ...target,
        );
      case ResourceType.DeviceArtifact:
        return processDeviceArtifactIntegrationSync(
          { items: await crawlItems(resource) },
          ...target,
        );
    }
  };

  const response = await ingest();
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
