import { z } from "zod";
import type { SourceBlock } from "@/components/sources";
import { CSV_UPLOAD_DISPLAY_NAME } from "@/features/integrations/platforms/csv-upload/contract";
import {
  IssueStatus,
  PlatformEnum,
  type Prisma,
  type VersionStatus,
} from "@/generated/prisma";
import { isSecurityRelated } from "../remediations/release";

const UNKNOWN_ASSET_STRING = "Unknown Asset";
export const UNKNOWN_DEVICE_TYPE_STRING = "Unknown";

type ProductWithType = {
  deviceType?: { displayName: string } | null;
} | null;

// product is required, so that a caller cannot leave out the device type
// by mistake. Pass `product: null` when an asset has none to give.
export type DeviceTypeSource = { product: ProductWithType };

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
  return asset?.product?.deviceType?.displayName ?? null;
}

/**
 * The search terms for the fields that name an asset in the UI. Search never
 * matches Asset.role, which is too free-form to search.
 */
export const assetNameSearchTerms = (match: Prisma.StringFilter) => [
  { hostname: match },
  { ip: match },
  { serialNumber: match },
  { product: { is: { deviceType: { is: { displayName: match } } } } },
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
  product: { select: deviceTypeLabelSelect },
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

export type AssetSourcesSource = {
  user: { name: string };
  externalMappings: ReadonlyArray<{
    integration: { name: string; platform: PlatformEnum };
  }>;
};

/**
 * Where an asset came from: the user who created it, then each integration that
 * reports it. Every CSV import is its own integration, so each shows as "CSV
 * Upload". An integration's shadow user shares its name, so an asset an
 * integration created lists that integration once.
 */
export function getAssetSources(asset: AssetSourcesSource): string[] {
  const integrations = asset.externalMappings.map(({ integration }) =>
    integration.platform === PlatformEnum.CSV_UPLOAD
      ? CSV_UPLOAD_DISPLAY_NAME
      : integration.name,
  );
  return [...new Set([asset.user.name, ...integrations])];
}

/**
 * getAssetSources as dashboard blocks: the creator as a person, then each integration that reports
 * the asset. An integration's shadow user is the integration, so it shows once, as an integration.
 * TODO VW-600: build these from the data provenance models instead (every source that has written
 * to the asset, not only its creator and current mappings). See docs/provenance-schema.md on the
 * data-provenance branch:
 * https://github.com/PATCH-UPGRADE/viper/blob/data-provenance/docs/provenance-schema.md
 */
export function getAssetSourceBlocks(asset: AssetSourcesSource): SourceBlock[] {
  const integrationBlocks: SourceBlock[] = [];
  for (const { integration } of asset.externalMappings) {
    const name =
      integration.platform === PlatformEnum.CSV_UPLOAD
        ? CSV_UPLOAD_DISPLAY_NAME
        : integration.name;
    if (integrationBlocks.some((block) => block.name === name)) continue;
    integrationBlocks.push({
      key: `integration:${name}`,
      name,
      kind: "integration",
      typeLabel: "Integration",
    });
  }
  const creatorIsIntegration = asset.externalMappings.some(
    ({ integration }) => integration.name === asset.user.name,
  );
  return creatorIsIntegration
    ? integrationBlocks
    : [
        {
          key: `user:${asset.user.name}`,
          name: asset.user.name,
          kind: "person",
          typeLabel: "Created by",
        },
        ...integrationBlocks,
      ];
}

export const VERSION_STATUS_LABELS: Record<VersionStatus, string> = {
  UNKNOWN: "Unknown",
  NOT_APPLICABLE: "Not applicable",
  KNOWN: "Known",
  UNSURE: "Unsure",
};

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

interface IssueWithRemediations {
  vulnerability: {
    remediations: Array<{
      id: string;
      isSecurityUpdate: boolean | null;
      _count: { vulnerabilities: number };
    }>;
  };
}

export function securityRemediationsOf<I extends IssueWithRemediations>(
  issues: I[],
): I["vulnerability"]["remediations"][number][] {
  const allRemediations = issues.flatMap(
    (issue) => issue.vulnerability.remediations,
  );
  const securityRemediations = allRemediations.filter(isSecurityRelated);

  const uniqueMap = new Map(securityRemediations.map((r) => [r.id, r]));
  return Array.from(uniqueMap.values());
}
