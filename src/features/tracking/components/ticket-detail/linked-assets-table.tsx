"use client";

import { XIcon } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { matchingAppliesToDeviceGroup } from "@/lib/device-matching";
import {
  type DetailAsset,
  type DetailRemediation,
  formatLocation,
  truncate,
} from "./shared";

export const LinkedAssetsTable = ({
  assets,
  remediations,
  onDetach,
  detachPending,
}: {
  assets: DetailAsset[];
  remediations: DetailRemediation[];
  onDetach?: (assetId: string) => void;
  detachPending?: boolean;
}) => {
  // Remediations no longer link device groups directly; each carries
  // vendor/product/version matching rules. Resolve the first remediation whose
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
          <TableHead>Role</TableHead>
          <TableHead>Model</TableHead>
          <TableHead>IP Address</TableHead>
          <TableHead>MAC Address</TableHead>
          <TableHead>Location</TableHead>
          <TableHead>Remediation</TableHead>
          {onDetach && <TableHead className="w-10" />}
        </TableRow>
      </TableHeader>
      <TableBody>
        {assets.map((a) => {
          const remediation = remediationForAsset(a);
          const model = a.deviceGroup
            ? [
                a.deviceGroup.vendor?.canonicalDisplayName,
                a.deviceGroup.product?.canonicalDisplayName,
              ]
                .filter(Boolean)
                .join(" ")
            : "—";
          return (
            <TableRow key={a.id} className="hover:bg-muted/40">
              <TableCell>
                <Link
                  href={`/assets/${a.id}`}
                  className="text-sm hover:underline"
                >
                  {a.role ?? "—"}
                </Link>
              </TableCell>
              <TableCell className="text-sm">{model || "—"}</TableCell>
              <TableCell className="font-mono text-xs">{a.ip}</TableCell>
              <TableCell className="font-mono text-xs">
                {a.macAddress ?? "—"}
              </TableCell>
              <TableCell className="text-sm text-muted-foreground">
                {formatLocation(a.location)}
              </TableCell>
              <TableCell className="text-sm">
                {remediation ? (
                  <span title={remediation.description ?? undefined}>
                    {truncate(
                      remediation.description ??
                        `Remediation ${remediation.id}`,
                      60,
                    )}
                  </span>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
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
