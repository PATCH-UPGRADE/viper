"use client";

import { XIcon } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ClampedCell } from "@/components/ui/clamped-cell";
import { Select } from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useUpdateTicket } from "@/features/tracking/hooks/use-tracking";
import type { TicketStatus } from "@/generated/prisma";
import {
  type DetailAssetTicket,
  formatLocation,
  TicketStatusSelectTrigger,
} from "./shared";

const AssetTicketStatusSelect = ({
  parentTicketId,
  assetId,
  ticketId,
  status,
}: {
  parentTicketId: string;
  assetId: string;
  ticketId: string;
  status: TicketStatus;
}) => {
  const update = useUpdateTicket(ticketId, parentTicketId, assetId);

  return (
    <Select
      value={status}
      onValueChange={(v) =>
        update.mutate({ id: ticketId, status: v as TicketStatus })
      }
      disabled={update.isPending}
    >
      <TicketStatusSelectTrigger status={status} size="sm" colored />
    </Select>
  );
};

export const LinkedAssetsTable = ({
  parentTicketId,
  assetTickets,
  onDetach,
  detachPending,
}: {
  parentTicketId: string;
  assetTickets: DetailAssetTicket[];
  onDetach?: (assetId: string) => void;
  detachPending?: boolean;
}) => {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Asset ID</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Role</TableHead>
          <TableHead>Model</TableHead>
          <TableHead>IP Address</TableHead>
          <TableHead>Location</TableHead>
          {onDetach && <TableHead className="w-10" />}
        </TableRow>
      </TableHeader>
      <TableBody>
        {assetTickets.map(({ asset, ticket }) => {
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
                  {asset.hostname ?? asset.id}
                </Link>
              </TableCell>
              <TableCell>
                <AssetTicketStatusSelect
                  parentTicketId={parentTicketId}
                  assetId={asset.id}
                  ticketId={ticket.id}
                  status={ticket.status}
                />
              </TableCell>
              <TableCell className="text-sm">
                <ClampedCell text={asset.role} />
              </TableCell>
              <TableCell className="text-sm">
                <ClampedCell text={model} />
              </TableCell>
              <TableCell className="font-mono text-xs">{asset.ip}</TableCell>
              <TableCell className="text-sm text-muted-foreground">
                <ClampedCell text={formatLocation(asset.location)} />
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
