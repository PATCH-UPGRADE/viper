import type { AssetStatus } from "@/generated/prisma";
import type { MatchKeysRow, RowOutcome } from "../contract";

export interface ContextAsset {
  id: string;
  label: string;
  platforms: string[];
  serialNumber: string | null;
  macAddress: string | null;
  hostname: string | null;
  ip: string | null;
  networkSegment: string | null;
  role: string | null;
  status: AssetStatus | null;
  location: Record<string, unknown> | null;
}

export interface MatchContext {
  assets: Map<string, ContextAsset>;
}

type MatchKey = "serialNumber" | "macAddress" | "hostname";

interface MatchLookups {
  bySerial: Map<string, string[]>;
  byMac: Map<string, string[]>;
  byHostname: Map<string, string[]>;
}

type DeviceMatch =
  | { kind: "none" }
  | { kind: "device"; assetId: string }
  | { kind: "conflict"; reason: string };

const NO_MATCH: DeviceMatch = { kind: "none" };

const conflict = (reason: string): DeviceMatch => ({
  kind: "conflict",
  reason,
});

const device = (assetId: string): DeviceMatch => ({ kind: "device", assetId });

function indexAssetsBy(
  assets: ContextAsset[],
  key: MatchKey,
): Map<string, string[]> {
  const assetIdsByValue = new Map<string, string[]>();
  for (const asset of assets) {
    const value = asset[key];
    if (value === null) continue;
    const assetIdsWithValue = assetIdsByValue.get(value) ?? [];
    assetIdsWithValue.push(asset.id);
    assetIdsByValue.set(value, assetIdsWithValue);
  }
  return assetIdsByValue;
}

function buildLookups(context: MatchContext): MatchLookups {
  const assets = [...context.assets.values()];
  return {
    bySerial: indexAssetsBy(assets, "serialNumber"),
    byMac: indexAssetsBy(assets, "macAddress"),
    byHostname: indexAssetsBy(assets, "hostname"),
  };
}

const assetIdsFor = (
  lookup: Map<string, string[]>,
  value: string | null,
): string[] => (value === null ? [] : (lookup.get(value) ?? []));

function matchByHostname(
  row: MatchKeysRow,
  lookups: MatchLookups,
): DeviceMatch {
  const hostnameMatches = assetIdsFor(lookups.byHostname, row.hostname);
  if (hostnameMatches.length > 1) {
    return conflict(
      `Hostname matches ${hostnameMatches.length} devices in VIPER`,
    );
  }
  const [deviceWithHostname] = hostnameMatches;
  return deviceWithHostname ? device(deviceWithHostname) : NO_MATCH;
}

function findDevice(
  row: MatchKeysRow,
  lookups: MatchLookups,
  context: MatchContext,
): DeviceMatch {
  const serialMatches = assetIdsFor(lookups.bySerial, row.serialNumber);
  if (serialMatches.length > 1) {
    return conflict(`Serial matches ${serialMatches.length} devices in VIPER`);
  }
  const macMatches = assetIdsFor(lookups.byMac, row.macAddress);
  if (macMatches.length > 1) {
    return conflict(
      `MAC address matches ${macMatches.length} devices in VIPER`,
    );
  }

  const [deviceWithSerial] = serialMatches;
  const [deviceWithMac] = macMatches;
  if (deviceWithSerial && deviceWithMac && deviceWithSerial !== deviceWithMac) {
    return conflict(
      "Serial and MAC address belong to different devices in VIPER",
    );
  }
  if (deviceWithSerial) return device(deviceWithSerial);

  if (deviceWithMac) {
    const serialOnMacDevice =
      context.assets.get(deviceWithMac)?.serialNumber ?? null;
    const serialsDisagree =
      row.serialNumber !== null &&
      serialOnMacDevice !== null &&
      serialOnMacDevice !== row.serialNumber;
    return serialsDisagree
      ? conflict("MAC address already assigned to another asset")
      : device(deviceWithMac);
  }

  const rowHasHardwareKey =
    row.serialNumber !== null || row.macAddress !== null;
  return rowHasHardwareKey ? NO_MATCH : matchByHostname(row, lookups);
}

export function planMatches(
  rows: MatchKeysRow[],
  context: MatchContext,
  inFileConflicts: Map<number, string>,
): RowOutcome[] {
  const lookups = buildLookups(context);
  const rowNumberByLinkedAsset = new Map<string, number>();

  return rows.map((row): RowOutcome => {
    const { rowNumber } = row;
    const inFileReason = inFileConflicts.get(rowNumber);
    if (inFileReason !== undefined) {
      return { kind: "fail", rowNumber, reason: inFileReason };
    }

    const match = findDevice(row, lookups, context);
    if (match.kind === "conflict") {
      return { kind: "fail", rowNumber, reason: match.reason };
    }
    if (match.kind === "none") return { kind: "add", rowNumber };

    const rowAlreadyLinked = rowNumberByLinkedAsset.get(match.assetId);
    if (rowAlreadyLinked !== undefined) {
      return {
        kind: "fail",
        rowNumber,
        reason: `Row ${rowAlreadyLinked} already links to this device`,
      };
    }
    rowNumberByLinkedAsset.set(match.assetId, rowNumber);
    return { kind: "link", rowNumber, assetId: match.assetId };
  });
}
