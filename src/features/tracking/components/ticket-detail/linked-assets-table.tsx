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
  type DetailAsset,
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
  const remediationForAsset = (a: DetailAsset): DetailRemediation | undefined =>
    remediations.find((r) =>
      r.deviceGroupMatchings.some((m) =>
        matchingAppliesToDeviceGroup(m, a.deviceGroup),
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
        {assetTickets.map(({ id, asset: a, ticket }) => {
          const remediation = remediationForAsset(a);
          const model = a.deviceGroup
            ? [
                a.deviceGroup.manufacturer?.canonicalDisplayName,
                a.deviceGroup.product?.canonicalDisplayName,
              ]
                .filter(Boolean)
                .join(" ")
            : "—";
          return (
            <TableRow key={id} className="hover:bg-muted/40">
              <TableCell>
                <Link
                  href={`/tracking/${ticket.id}`}
                  className="font-mono text-xs font-medium text-primary hover:underline"
                >
                  {a.hostname ?? a.id.slice(0, 8)}
                </Link>
              </TableCell>
              <TableCell className="text-sm">
                <ClampedCell text={a.role} />
              </TableCell>
              <TableCell className="text-sm">
                <ClampedCell text={model} />
              </TableCell>
              <TableCell className="font-mono text-xs">{a.ip}</TableCell>
              <TableCell className="font-mono text-xs">
                {a.macAddress ?? "—"}
              </TableCell>
              <TableCell className="text-sm text-muted-foreground">
                <ClampedCell text={formatLocation(a.location)} />
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
                <AssetStatusBadge status={a.status} />
              </TableCell>
              <TableCell>
                <StatusChip status={ticket.status} />
              </TableCell>
              {onDetach && (
                <TableCell className="w-10">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onDetach(a.id)}
                    disabled={detachPending}
                    aria-label={`Detach ${a.hostname ?? a.ip}`}
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
