import "server-only";
import { processIntegrationSync } from "@/features/integrations/core/sync/upsert";
import type {
  ResourceSyncCtx,
  SyncOutcome,
} from "@/features/integrations/core/types";
import { releaseScalarData } from "@/features/remediations/release";
import { normalizeIdentifiers } from "@/features/vulnerabilities/server/identity";
import { ResourceType, VersionStatus } from "@/generated/prisma";
import prisma from "@/lib/db";
import { resolveMatchingIdForDevice } from "@/lib/router-utils";
import type { FleetConfig, FleetCreds } from "../config";
import {
  type FleetDevice,
  type FleetRemediationItem,
  fetchSystemUpdates,
  fetchUpdateCves,
  toRemediationItem,
} from "./feed";

/**
 * The vulnerabilities Viper already holds for these CVE IDs, found by identifier. A CVE Viper
 * doesn't hold is left out: the remediation is linked to it only once it arrives.
 */
export async function heldVulnerabilities(
  cveIds: string[],
): Promise<{ id: string }[]> {
  const values = normalizeIdentifiers(cveIds).map(({ value }) => value);
  if (values.length === 0) return [];
  return prisma.vulnerability.findMany({
    where: { identifiers: { some: { value: { in: values } } } },
    select: { id: true },
  });
}

/** The exact matching for one Fleet device, or null when the asset has no
 * manufacturer or product to match on.
 */
async function matchingIdFor(device: FleetDevice): Promise<string | null> {
  const { manufacturerId, productId, versionId, versionStatus } = device;
  if (!manufacturerId || !productId) return null;
  return resolveMatchingIdForDevice({
    manufacturer: { id: manufacturerId },
    product: { id: productId },
    version: versionId
      ? { id: versionId }
      : {
          status:
            versionStatus === VersionStatus.NOT_APPLICABLE
              ? "NOT_APPLICABLE"
              : "UNKNOWN",
        },
  });
}

export async function syncRemediations(
  ctx: ResourceSyncCtx<FleetConfig, FleetCreds>,
): Promise<SyncOutcome> {
  const { integrationId, integrationUserId } = ctx;

  const devices = await prisma.externalAssetMapping.findMany({
    where: { integrationId },
    select: {
      externalId: true,
      item: {
        select: {
          manufacturerId: true,
          productId: true,
          versionId: true,
          versionStatus: true,
        },
      },
    },
  });

  const byNumber = new Map<string, FleetRemediationItem>();
  for (const device of devices) {
    for (const raw of await fetchSystemUpdates(
      ctx.session,
      device.externalId,
    )) {
      const item = byNumber.get(raw.number) ?? toRemediationItem(raw);
      item.devices.push(device.item);
      byNumber.set(raw.number, item);
    }
  }

  const items = [...byNumber.values()];
  if (items.length === 0) return { cursor: null };

  for (const item of items) {
    item.cveIds = await fetchUpdateCves(ctx.session, item.externalId);
    item.release.isSecurityUpdate = item.cveIds.length > 0 ? true : null;
  }

  const outcome = await processIntegrationSync(
    prisma,
    {
      model: prisma.remediation,
      mappingModel: prisma.externalRemediationMapping,
      shouldRecordSyncOutcome: false,
      transformInputItem: async (item: FleetRemediationItem, userId) => {
        const matchingIds = new Set<string>();
        for (const device of item.devices) {
          const id = await matchingIdFor(device);
          if (id) matchingIds.add(id);
        }

        const held = await heldVulnerabilities(item.cveIds);

        const fields = {
          description: item.description,
          narrative: item.narrative,
          isManufacturerRemediation: true,
          ...releaseScalarData(item.release, "stated"),
          deviceGroupMatchings: {
            connect: [...matchingIds].map((id) => ({ id })),
          },
          vulnerabilities: { connect: held.map(({ id }) => ({ id })) },
        };

        return {
          createData: { ...fields, userId },
          updateData: fields,
          uniqueFieldConditions: [],
          artifactsData: undefined,
        };
      },
    },
    { items },
    integrationUserId,
    integrationId,
    ResourceType.Remediation,
  );
  if (outcome.shouldRetry) {
    throw new Error(`Fleet remediation sync incomplete: ${outcome.message}`);
  }
  return { cursor: null };
}
