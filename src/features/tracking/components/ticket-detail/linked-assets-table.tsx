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
  // Map deviceGroupId → first remediation that affects it
  const remediationByDeviceGroup = new Map<string, DetailRemediation>();
  for (const r of remediations) {
    for (const dg of r.affectedDeviceGroups) {
      if (!remediationByDeviceGroup.has(dg.id)) {
        remediationByDeviceGroup.set(dg.id, r);
      }
    }
  }

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
          const remediation = remediationByDeviceGroup.get(a.deviceGroupId);
          const model = a.deviceGroup
            ? [a.deviceGroup.manufacturer, a.deviceGroup.modelName]
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
