"use client";

import { XIcon } from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ClampedCell } from "@/components/ui/clamped-cell";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getChipClass } from "@/features/tag-colors/palette";
import type { AssetStatus } from "@/generated/prisma";
import { matchingAppliesToDeviceGroup } from "@/lib/device-matching";
import {
  type DetailAssetTicket,
  type DetailRemediation,
  formatLocation,
  StatusChip,
} from "./shared";

const assetStatusHue: Record<AssetStatus, string> = {
  Active: "green",
  Maintenance: "yellow",
  Decommissioned: "gray",
};

const AssetStatusBadge = ({ status }: { status: AssetStatus | null }) => {
  if (!status) return <span className="text-muted-foreground">—</span>;
  return (
    <Badge variant="outline" className={getChipClass(assetStatusHue[status])}>
      {status}
    </Badge>
  );
};

export const LinkedAssetsTable = ({
  assetTickets,
  remediations,
  onDetach,
  detachPending,
}: {
  assetTickets: DetailAssetTicket[];
  remediations: DetailRemediation[];
  onDetach?: (assetId: string) => void;
  detachPending?: boolean;
}) => {
  // Remediations no longer link device groups directly; each carries
  // manufacturer/product/version matching rules. Resolve the first remediation whose
  // rules apply to a given asset's device group.
  const remediationForAsset = (
    asset: DetailAssetTicket["asset"],
  ): DetailRemediation | undefined =>
    remediations.find((remediation) =>
      remediation.deviceGroupMatchings.some((matching) =>
        matchingAppliesToDeviceGroup(matching, asset.deviceGroup),
      ),
    );

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Asset ID</TableHead>
          <TableHead>Role</TableHead>
          <TableHead>Model</TableHead>
          <TableHead>IP Address</TableHead>
          <TableHead>MAC Address</TableHead>
          <TableHead>Location</TableHead>
          <TableHead>Remediation</TableHead>
          <TableHead>Asset Status</TableHead>
          <TableHead>Ticket Status</TableHead>
          {onDetach && <TableHead className="w-10" />}
        </TableRow>
      </TableHeader>
      <TableBody>
        {assetTickets.map(({ asset, ticket }) => {
          const remediation = remediationForAsset(asset);
          const model = asset.deviceGroup
            ? [
                asset.deviceGroup.manufacturer?.canonicalDisplayName,
                asset.deviceGroup.product?.canonicalDisplayName,
              ]
                .filter(Boolean)
                .join(" ")
            : "—";
          return (
            <TableRow key={ticket.id} className="hover:bg-muted/40">
              <TableCell>
                <Link
                  href={`/tracking/${ticket.id}`}
                  className="font-mono text-xs font-medium text-primary hover:underline"
                >
                  {asset.hostname ?? asset.id.slice(0, 8)}
                </Link>
              </TableCell>
              <TableCell className="text-sm">
                <ClampedCell text={asset.role} />
              </TableCell>
              <TableCell className="text-sm">
                <ClampedCell text={model} />
              </TableCell>
              <TableCell className="font-mono text-xs">{asset.ip}</TableCell>
              <TableCell className="font-mono text-xs">
                {asset.macAddress ?? "—"}
              </TableCell>
              <TableCell className="text-sm text-muted-foreground">
                <ClampedCell text={formatLocation(asset.location)} />
              </TableCell>
              <TableCell className="text-sm">
                <ClampedCell
                  text={
                    remediation
                      ? (remediation.description ??
                        `Remediation ${remediation.id}`)
                      : null
                  }
                  maxWidthClass="max-w-[14rem]"
                />
              </TableCell>
              <TableCell>
                <AssetStatusBadge status={asset.status} />
              </TableCell>
              <TableCell>
                <StatusChip status={ticket.status} />
              </TableCell>
              {onDetach && (
                <TableCell className="w-10">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onDetach(asset.id)}
                    disabled={detachPending}
                    aria-label={`Detach ${asset.hostname ?? asset.ip}`}
                  >
                    <XIcon className="size-4" />
                  </Button>
                </TableCell>
              )}
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
};
