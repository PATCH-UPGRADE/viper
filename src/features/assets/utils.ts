import { z } from "zod";
import { IssueStatus, type Prisma } from "@/generated/prisma";

const UNKNOWN_ASSET_STRING = "Unknown Asset";
export const UNKNOWN_DEVICE_TYPE_STRING = "Unknown";

type DeviceGroupWithType = {
  product?: { deviceType?: { displayName: string } | null } | null;
} | null;

// deviceGroup is required, so that a caller cannot leave out the device type
// by mistake. Pass `deviceGroup: null` when an asset has none to give.
export type DeviceTypeSource = { deviceGroup: DeviceGroupWithType };

/** Selects what getAssetDeviceTypeLabel reads, under a product select. */
export const deviceTypeLabelSelect = {
  deviceType: { select: { displayName: true } },
} as const;

/** The output schema for deviceTypeLabelSelect. */
export const deviceTypeLabelSchema = z
  .object({ displayName: z.string() })
  .nullable();

export function getAssetDeviceTypeLabel(
  asset: DeviceTypeSource | null | undefined,
): string | null {
  return asset?.deviceGroup?.product?.deviceType?.displayName ?? null;
}

/**
 * The search terms for the fields that name an asset in the UI. Search never
 * matches Asset.role, which is too free-form to search.
 */
export const assetNameSearchTerms = (match: Prisma.StringFilter) => [
  { hostname: match },
  { ip: match },
  { serialNumber: match },
  {
    deviceGroup: {
      is: { product: { is: { deviceType: { is: { displayName: match } } } } },
    },
  },
];

// The UI names an asset by what it is, never by Asset.role: the role is free
// text that can grow long. Agents and external platforms still get the role.

/** What an asset is, for titles and labels in the UI. */
export function getAssetTitle(asset: DeviceTypeSource): string {
  return getAssetDeviceTypeLabel(asset) ?? UNKNOWN_ASSET_STRING;
}

const assetNameFieldsSelect = {
  id: true,
  hostname: true,
  ip: true,
  serialNumber: true,
} as const;

type AssetNameFields = {
  id: string;
  hostname?: string | null;
  ip?: string | null;
  serialNumber?: string | null;
};

export const assetNameSelect = {
  ...assetNameFieldsSelect,
  deviceGroup: { select: { product: { select: deviceTypeLabelSelect } } },
} as const;

export type AssetNameSource = AssetNameFields & DeviceTypeSource;

export const assetAgentNameSelect = {
  ...assetNameFieldsSelect,
  role: true,
} as const;

export type AgentNameSource = AssetNameFields & { role?: string | null };

const firstPresent = (names: (string | null | undefined)[]) =>
  names.find((name) => name?.trim());

/**
 * The value that tells one asset from another: hostname, IP, serial number,
 * or id. Labels that show the device type add it, because many assets share
 * one type.
 */
export function getAssetIdentifier(asset: AssetNameFields): string {
  return (
    firstPresent([asset.hostname, asset.ip, asset.serialNumber]) ?? asset.id
  );
}

export function getAssetDisplayName(asset: AssetNameSource): string {
  return (
    firstPresent([
      asset.hostname,
      asset.ip,
      asset.serialNumber,
      getAssetDeviceTypeLabel(asset),
    ]) ?? asset.id
  );
}

export function getAssetNameForAgent(asset: AgentNameSource): string {
  return (
    firstPresent([asset.hostname, asset.ip, asset.serialNumber, asset.role]) ??
    asset.id
  );
}

// One remediation can fix several of the asset's vulnerabilities, so count
// distinct remediations, not a sum of per-vulnerability counts.
export function countAffectedRemediations(
  issues: Array<{
    status: IssueStatus;
    vulnerability: { remediations: Array<{ id: string }> };
  }>,
): number {
  const seen = new Set<string>();
  for (const issue of issues) {
    if (issue.status !== IssueStatus.AFFECTED) continue;
    for (const r of issue.vulnerability.remediations) seen.add(r.id);
  }
  return seen.size;
}
