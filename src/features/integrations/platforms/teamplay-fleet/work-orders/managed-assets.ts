import "server-only";
import { PlatformEnum, type Prisma, ResourceType } from "@/generated/prisma";
import prisma from "@/lib/db";

/**
 * Which assets may a Fleet work order be opened for, and what does Siemens call
 * them? An asset qualifies by carrying an `ExternalAssetMapping` to a Fleet
 * integration, whose `externalId` is the Fleet equipmentKey. Both the agent tool
 * and the approval mutation ask this question, and the mutation asks it again
 * because neither the model nor the client is trusted.
 */

export interface FleetManagedAsset {
  assetId: string;
  hostname: string | null;
  ip: string | null;
  role: string | null;
  /** Fleet's identifier for the physical device; activities carry it too. */
  equipmentKey: string;
}

/**
 * Only the columns a managed asset needs. An Asset also carries `location` and
 * `utilization` JSON blobs, which no caller here reads.
 */
const managedAssetSelect = (integrationIds: string[]) =>
  ({
    id: true,
    hostname: true,
    ip: true,
    role: true,
    externalMappings: {
      where: { integrationId: { in: integrationIds } },
      select: { externalId: true },
      take: 1,
    },
  }) satisfies Prisma.AssetSelect;

type ManagedAssetRow = {
  id: string;
  hostname: string | null;
  ip: string | null;
  role: string | null;
  externalMappings: { externalId: string }[];
};

function toManagedAsset(asset: ManagedAssetRow): FleetManagedAsset {
  return {
    assetId: asset.id,
    hostname: asset.hostname,
    ip: asset.ip,
    role: asset.role,
    equipmentKey: asset.externalMappings[0].externalId,
  };
}

/**
 * Every integration running the Fleet platform. One site can back several rows,
 * and an asset counts as Siemens-serviced if it is mapped through any of them.
 */
function fleetIntegrations() {
  return prisma.integration.findMany({
    where: { platform: PlatformEnum.FLEET },
    include: { resourceSyncs: { select: { resource: true } } },
    orderBy: { createdAt: "asc" },
  });
}

/**
 * The integration that owns work order mappings — the one whose resource syncs
 * include WorkOrder, so an order filed here is updated rather than duplicated
 * when the next poll returns it. There is deliberately no fallback to another
 * integration: attaching the mapping to the equipment-sync row would break that
 * dedup contract.
 */
export async function workOrderIntegration() {
  const integrations = await fleetIntegrations();
  const integration = integrations.find((i) =>
    i.resourceSyncs.some((s) => s.resource === ResourceType.WorkOrder),
  );

  if (!integration) {
    throw new Error(
      "No Siemens Healthineers Fleet integration is configured — cannot file a Fleet work order.",
    );
  }
  return integration;
}

export async function listFleetManagedAssets(): Promise<FleetManagedAsset[]> {
  const integrations = await fleetIntegrations();
  if (integrations.length === 0) return [];
  const integrationIds = integrations.map((i) => i.id);

  const assets = await prisma.asset.findMany({
    where: {
      externalMappings: { some: { integrationId: { in: integrationIds } } },
    },
    select: managedAssetSelect(integrationIds),
    orderBy: { hostname: "asc" },
  });

  return assets.map(toManagedAsset);
}

export class UnmanagedAssetsError extends Error {
  constructor(public readonly labels: string[]) {
    super(
      `Not managed by Siemens Healthineers, so no Fleet work order can be opened for: ${labels.join(", ")}. Fleet work orders are only available for Siemens-serviced assets.`,
    );
    this.name = "UnmanagedAssetsError";
  }
}

/**
 * Resolve asset ids to their Fleet equipment. Throws `UnmanagedAssetsError`
 * naming the offenders: the message goes back to the model as the tool result so
 * it can correct itself, and to the user when the approval is rejected.
 */
export async function resolveFleetAssets(
  assetIds: string[],
): Promise<FleetManagedAsset[]> {
  const unique = [...new Set(assetIds)];
  if (unique.length === 0) return [];

  // Scoped to the ids asked for. Listing every Siemens-serviced asset to answer
  // a handful of ids costs the whole inventory on every proposal.
  const integrations = await fleetIntegrations();
  const integrationIds = integrations.map((i) => i.id);
  const managed =
    integrationIds.length === 0
      ? []
      : await prisma.asset.findMany({
          where: {
            id: { in: unique },
            externalMappings: {
              some: { integrationId: { in: integrationIds } },
            },
          },
          select: managedAssetSelect(integrationIds),
        });
  const byId = new Map(managed.map((a) => [a.id, toManagedAsset(a)]));

  const resolved: FleetManagedAsset[] = [];
  const missing: string[] = [];
  for (const id of unique) {
    const asset = byId.get(id);
    if (asset) resolved.push(asset);
    else missing.push(id);
  }

  if (missing.length > 0) {
    // Label unknown ids with their hostname when the asset exists at all, so the
    // error reads "MRI-01" rather than a cuid the user has never seen.
    const rows = await prisma.asset.findMany({
      where: { id: { in: missing } },
      select: { id: true, hostname: true, ip: true },
    });
    const labels = missing.map((id) => {
      const row = rows.find((r) => r.id === id);
      if (!row) return `${id} (no such asset)`;
      return row.hostname ?? row.ip ?? id;
    });
    throw new UnmanagedAssetsError(labels);
  }

  return resolved;
}
