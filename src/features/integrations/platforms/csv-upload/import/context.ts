import "server-only";
import { getAssetDisplayName } from "@/features/assets/utils";
import type { Prisma } from "@/generated/prisma";
import prisma from "@/lib/db";
import { displayNameFor } from "../../../core/registry";
import type { MatchKeysRow, NameDecision, NameDecisions } from "../contract";
import type { ContextAsset, MatchContext } from "./plan";

export interface CanonicalNames {
  manufacturers: Map<string, string>;
  products: Map<string, string>;
}

const contextAssetSelect = {
  id: true,
  ip: true,
  hostname: true,
  macAddress: true,
  serialNumber: true,
  networkSegment: true,
  role: true,
  status: true,
  location: true,
  deviceGroup: {
    select: {
      manufacturer: { select: { canonicalDisplayName: true } },
      product: { select: { canonicalDisplayName: true } },
    },
  },
  externalMappings: {
    select: { integration: { select: { platform: true } } },
  },
} as const satisfies Prisma.AssetSelect;

type ContextAssetRow = Prisma.AssetGetPayload<{
  select: typeof contextAssetSelect;
}>;

const distinctPresent = (values: Array<string | null>): string[] => [
  ...new Set(values.filter((value): value is string => value !== null)),
];

function storedLocation(
  location: Prisma.JsonValue | null,
): Record<string, unknown> | null {
  const isObject =
    typeof location === "object" &&
    location !== null &&
    !Array.isArray(location);
  return isObject ? { ...location } : null;
}

function deviceLabel(assetRow: ContextAssetRow): string {
  const manufacturerName =
    assetRow.deviceGroup.manufacturer?.canonicalDisplayName;
  const productName = assetRow.deviceGroup.product?.canonicalDisplayName;
  const deviceName = [manufacturerName, productName].filter(Boolean).join(" ");
  if (!deviceName) return getAssetDisplayName(assetRow);
  return assetRow.role ? `${deviceName} · ${assetRow.role}` : deviceName;
}

function toContextAsset(assetRow: ContextAssetRow): ContextAsset {
  const reportingPlatforms = assetRow.externalMappings.map((mapping) =>
    displayNameFor(mapping.integration.platform),
  );
  return {
    id: assetRow.id,
    label: deviceLabel(assetRow),
    platforms: [...new Set(reportingPlatforms)],
    serialNumber: assetRow.serialNumber,
    macAddress: assetRow.macAddress,
    hostname: assetRow.hostname,
    ip: assetRow.ip,
    networkSegment: assetRow.networkSegment,
    role: assetRow.role,
    status: assetRow.status,
    location: storedLocation(assetRow.location),
  };
}

export async function loadMatchContext(
  rows: MatchKeysRow[],
  options: { excludeIntegrationId?: string } = {},
): Promise<MatchContext> {
  const keylessRows = rows.filter(
    (row) => row.serialNumber === null && row.macAddress === null,
  );
  const serials = distinctPresent(rows.map((row) => row.serialNumber));
  const macAddresses = distinctPresent(rows.map((row) => row.macAddress));
  const hostnames = distinctPresent(keylessRows.map((row) => row.hostname));

  const keyClauses: Prisma.AssetWhereInput[] = [];
  if (serials.length > 0) keyClauses.push({ serialNumber: { in: serials } });
  if (macAddresses.length > 0) {
    keyClauses.push({ macAddress: { in: macAddresses } });
  }
  if (hostnames.length > 0) keyClauses.push({ hostname: { in: hostnames } });
  if (keyClauses.length === 0) return { assets: new Map() };

  const where: Prisma.AssetWhereInput = options.excludeIntegrationId
    ? {
        OR: keyClauses,
        externalMappings: {
          none: { integrationId: options.excludeIntegrationId },
        },
      }
    : { OR: keyClauses };

  const assetRows = await prisma.asset.findMany({
    where,
    select: contextAssetSelect,
  });
  return {
    assets: new Map(
      assetRows.map((assetRow) => [assetRow.id, toContextAsset(assetRow)]),
    ),
  };
}

function chosenIdsByNameKey(
  decisions: Record<string, NameDecision>,
): Map<string, string> {
  const chosenIds = new Map<string, string>();
  for (const [nameKey, decision] of Object.entries(decisions)) {
    if (decision.kind === "existing") chosenIds.set(nameKey, decision.id);
  }
  return chosenIds;
}

function canonicalNamesByNameKey(
  chosenIds: Map<string, string>,
  namedRows: Array<{ id: string; canonicalName: string }>,
): Map<string, string> {
  const canonicalNameById = new Map(
    namedRows.map((namedRow) => [namedRow.id, namedRow.canonicalName]),
  );
  const canonicalNames = new Map<string, string>();
  for (const [nameKey, chosenId] of chosenIds) {
    const canonicalName = canonicalNameById.get(chosenId);
    if (canonicalName !== undefined) canonicalNames.set(nameKey, canonicalName);
  }
  return canonicalNames;
}

export async function loadCanonicalNames(
  nameDecisions: NameDecisions,
): Promise<CanonicalNames> {
  const chosenManufacturerIds = chosenIdsByNameKey(nameDecisions.manufacturers);
  const chosenProductIds = chosenIdsByNameKey(nameDecisions.products);

  const [manufacturerRows, productRows] = await Promise.all([
    chosenManufacturerIds.size > 0
      ? prisma.manufacturer.findMany({
          where: { id: { in: [...new Set(chosenManufacturerIds.values())] } },
          select: { id: true, canonicalName: true },
        })
      : [],
    chosenProductIds.size > 0
      ? prisma.product.findMany({
          where: { id: { in: [...new Set(chosenProductIds.values())] } },
          select: { id: true, canonicalName: true },
        })
      : [],
  ]);

  return {
    manufacturers: canonicalNamesByNameKey(
      chosenManufacturerIds,
      manufacturerRows,
    ),
    products: canonicalNamesByNameKey(chosenProductIds, productRows),
  };
}
