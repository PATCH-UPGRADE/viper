"use client";

import { formatDistanceToNow } from "date-fns";
import { PlugIcon } from "lucide-react";
import {
  DrawerField,
  DrawerFieldGrid,
  DrawerSection,
  DrawerSections,
  formatDateWithAgo,
} from "@/components/dashboard-drawers";
import { SourceList } from "@/components/sources";
import { Badge } from "@/components/ui/badge";
import { CopyCode } from "@/components/ui/code";
import { PlatformEnum } from "@/generated/prisma";
import { type AssetWithIssueRelations, locationSchema } from "../../types";
import {
  getAssetDeviceTypeLabel,
  UNKNOWN_DEVICE_TYPE_STRING,
  VERSION_STATUS_LABELS,
} from "../../utils";
import { AssetQrPdfLink } from "../asset-qr-pdf-link";
import { AssetUtilizationHeatMapGridVertical } from "../asset-utilization-grid";
import { NetworkFlowSection } from "./network-flow-section";

export const assetStatusVariant = (
  status: AssetWithIssueRelations["status"],
) =>
  status === "Active"
    ? "default"
    : status === "Decommissioned"
      ? "secondary"
      : "outline";

/**
 * Where VIPER gets its information about the asset. Only its integrations for now.
 * TODO VW-600: list every source from the data provenance models (people, API keys and
 * automations too), with when each last wrote to the asset.
 */
function AssetSourceList({ asset }: { asset: AssetWithIssueRelations }) {
  return (
    <SourceList
      emptyMessage="Not mapped to any integration."
      items={asset.externalMappings.map((mapping) => ({
        key: `${mapping.integration.id}:${mapping.externalId}`,
        icon: PlugIcon,
        name: mapping.integration.name,
        tag:
          mapping.integration.platform === PlatformEnum.CSV_UPLOAD
            ? "CSV"
            : undefined,
        meta: mapping.lastSynced
          ? `Last synced ${formatDistanceToNow(mapping.lastSynced, { addSuffix: true })}`
          : mapping.integration.platform === PlatformEnum.CSV_UPLOAD
            ? "Imported from a CSV file"
            : "Not synced yet",
        links: [
          ...(mapping.webUrl ? [{ label: "Web", href: mapping.webUrl }] : []),
          ...(mapping.upstreamApi
            ? [{ label: "API", href: mapping.upstreamApi }]
            : []),
        ],
      }))}
    />
  );
}

export function OverviewSection({ asset }: { asset: AssetWithIssueRelations }) {
  const locationResult = asset.location
    ? locationSchema.safeParse(asset.location)
    : null;
  const location = locationResult?.success ? locationResult.data : null;
  const locationText = [
    location?.facility,
    location?.building,
    location?.floor,
    location?.room,
  ]
    .filter(Boolean)
    .join(" / ");

  return (
    <DrawerSections>
      <DrawerSection title="Device Information">
        <DrawerFieldGrid>
          <DrawerField label="Manufacturer">
            {asset.manufacturer?.canonicalDisplayName}
          </DrawerField>
          <DrawerField label="Product">
            {asset.product?.canonicalDisplayName}
          </DrawerField>
          <DrawerField label="Device Type">
            {getAssetDeviceTypeLabel(asset) ?? UNKNOWN_DEVICE_TYPE_STRING}
          </DrawerField>
          <DrawerField label="Version">
            {asset.version?.canonicalDisplayName}
          </DrawerField>
          <DrawerField label="Version Status">
            {VERSION_STATUS_LABELS[asset.versionStatus]}
          </DrawerField>
          <DrawerField label="Role">{asset.role}</DrawerField>
          <DrawerField label="Serial Number">{asset.serialNumber}</DrawerField>
          <DrawerField label="Status">
            {asset.status && (
              <Badge variant={assetStatusVariant(asset.status)}>
                {asset.status}
              </Badge>
            )}
          </DrawerField>
          <DrawerField label="Location">{locationText}</DrawerField>
        </DrawerFieldGrid>
      </DrawerSection>

      <DrawerSection title="Network Information">
        <DrawerFieldGrid>
          <DrawerField label="Hostname">{asset.hostname}</DrawerField>
          <DrawerField label="IP Address">
            {asset.ip && <CopyCode>{asset.ip}</CopyCode>}
          </DrawerField>
          <DrawerField label="MAC Address">
            {asset.macAddress && <CopyCode>{asset.macAddress}</CopyCode>}
          </DrawerField>
          <DrawerField label="Network Segment">
            {asset.networkSegment}
          </DrawerField>
        </DrawerFieldGrid>
      </DrawerSection>

      <DrawerSection
        title="Sources"
        description="Where VIPER gets its information about this asset from"
      >
        <AssetSourceList asset={asset} />
      </DrawerSection>

      <DrawerSection title="Device Utilization">
        <div className="overflow-x-auto">
          <AssetUtilizationHeatMapGridVertical
            utilization={asset.utilization}
          />
        </div>
      </DrawerSection>

      <NetworkFlowSection assetId={asset.id} />

      <DrawerSection title="Links">
        <AssetQrPdfLink assetId={asset.id} />
      </DrawerSection>

      <DrawerSection title="Metadata">
        <DrawerFieldGrid className="sm:grid-cols-1 lg:grid-cols-1">
          <DrawerField label="Created">
            {formatDateWithAgo(asset.createdAt)}
            <div className="text-xs text-muted-foreground">
              By {asset.user.name}
            </div>
          </DrawerField>
          <DrawerField label="Last Updated">
            {formatDateWithAgo(asset.updatedAt)}
          </DrawerField>
          <DrawerField label="Asset ID">
            <CopyCode>{asset.id}</CopyCode>
          </DrawerField>
        </DrawerFieldGrid>
      </DrawerSection>

      {/* TODO VW-600: an Activity section goes here: the asset's field changes over time, from
          the data provenance models, like work order and notification activity. */}
    </DrawerSections>
  );
}
