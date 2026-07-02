"use client";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MoreVerticalDropdownMenu } from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { deviceGroupMatchingLabel, parseLocation } from "@/lib/string-utils";
import type { NotificationDetailWithRelations } from "../types";

export function NotificationAffectedAssetsTab({
  deviceGroupsMatchings,
}: {
  deviceGroupsMatchings: NotificationDetailWithRelations["deviceGroupsMatchings"];
}) {
  const withAssets = deviceGroupsMatchings.filter(
    (m) => m.assetCount > 0,
  );

  if (withAssets.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No device groups with matching assets found.
      </p>
    );
  }

  return (
    <>
      {withAssets.map((mapping) => (
        <Card key={mapping.id}>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              {deviceGroupMatchingLabel(mapping.deviceGroupMatching)}
              <Badge variant="secondary" className="font-normal">
                {mapping.assetCount}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Asset ID</TableHead>
                  <TableHead>IP Address</TableHead>
                  <TableHead>Location</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {mapping.assets.map((asset) => (
                  <TableRow key={asset.id}>
                    <TableCell className="font-mono text-xs">
                      {asset.hostname ?? asset.id}
                    </TableCell>
                    <TableCell>{asset.ip}</TableCell>
                    <TableCell>{parseLocation(asset.location)}</TableCell>
                    <TableCell>{asset.status ?? "—"}</TableCell>
                    <TableCell>
                      <MoreVerticalDropdownMenu
                        items={[
                          {
                            label: "View asset detail",
                            href: `/assets/${asset.id}`,
                          },
                        ]}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ))}
    </>
  );
}
