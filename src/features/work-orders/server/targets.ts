import "server-only";
import type { PlatformEnum } from "@/generated/prisma";
import prisma from "@/lib/db";

/**
 * Where can a work order for these assets be filed?
 *
 * `ManagesRelationship` is the answer: it records who services an asset, and
 * `workOrderIntegration` names the platform their orders go to. A relationship
 * without one describes an in-house owner, so it is not a filing target.
 *
 * An asset with no target is not an error. VIPER tracks the order itself, and
 * nothing is sent to a vendor.
 */

interface TargetAsset {
  id: string;
  hostname: string | null;
  ip: string | null;
  /** The platform's own id for this asset. Null when it was never synced. */
  externalId: string | null;
}

export interface WorkOrderTarget {
  integrationId: string;
  integrationName: string;
  platform: PlatformEnum;
  /** Free text from the relationship, so a model can tell two targets apart. */
  responsibilities: string;
  managedBy: string | null;
  assets: TargetAsset[];
}

export interface ResolvedTargets {
  targets: WorkOrderTarget[];
  /** Assets no platform files for. They can still be tracked in VIPER. */
  unmanaged: { id: string; label: string }[];
  /** Requested ids with no asset behind them at all. */
  unknownIds: string[];
}

/** How an asset is named to a person: hostname, else IP, else its id. */
export const labelFor = (a: {
  id: string;
  hostname: string | null;
  ip: string | null;
}) => a.hostname ?? a.ip ?? a.id;

export async function resolveWorkOrderTargets(
  assetIds: string[],
): Promise<ResolvedTargets> {
  const unique = [...new Set(assetIds)];
  if (unique.length === 0)
    return { targets: [], unmanaged: [], unknownIds: [] };

  const relationships = await prisma.managesRelationship.findMany({
    where: {
      workOrderIntegrationId: { not: null },
      assets: { some: { id: { in: unique } } },
    },
    select: {
      responsibilities: true,
      vendor: { select: { canonicalDisplayName: true } },
      department: { select: { name: true } },
      workOrderIntegration: {
        select: { id: true, name: true, platform: true },
      },
      assets: {
        where: { id: { in: unique } },
        select: {
          id: true,
          hostname: true,
          ip: true,
          externalMappings: {
            select: { integrationId: true, externalId: true },
          },
        },
      },
    },
  });

  // One integration can be named by several relationships — a vendor contract
  // and a department arrangement can both point at the same platform — so the
  // assets are gathered per integration rather than per relationship.
  const byIntegration = new Map<string, WorkOrderTarget>();
  const claimed = new Set<string>();

  for (const rel of relationships) {
    const integration = rel.workOrderIntegration;
    if (!integration) continue;

    const target =
      byIntegration.get(integration.id) ??
      ({
        integrationId: integration.id,
        integrationName: integration.name,
        platform: integration.platform,
        responsibilities: rel.responsibilities,
        managedBy:
          rel.vendor?.canonicalDisplayName ?? rel.department?.name ?? null,
        assets: [],
      } satisfies WorkOrderTarget);

    for (const asset of rel.assets) {
      claimed.add(asset.id);
      if (target.assets.some((a) => a.id === asset.id)) continue;
      target.assets.push({
        id: asset.id,
        hostname: asset.hostname,
        ip: asset.ip,
        externalId:
          asset.externalMappings.find((m) => m.integrationId === integration.id)
            ?.externalId ?? null,
      });
    }

    byIntegration.set(integration.id, target);
  }

  const missing = unique.filter((id) => !claimed.has(id));
  const rows = missing.length
    ? await prisma.asset.findMany({
        where: { id: { in: missing } },
        select: { id: true, hostname: true, ip: true },
      })
    : [];

  const unknownIds: string[] = [];
  const unmanaged = missing.map((id) => {
    const row = rows.find((r) => r.id === id);
    if (!row) unknownIds.push(id);
    return { id, label: row ? labelFor(row) : `${id} (no such asset)` };
  });

  return { targets: [...byIntegration.values()], unmanaged, unknownIds };
}
