"use client";

import { PlusIcon } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { getSwatchClass } from "@/features/tag-colors/palette";
import { TicketStatus } from "@/generated/prisma";
import { cn } from "@/lib/utils";
import {
  useAttachAsset,
  useAttachableAssets,
  useDetachAsset,
} from "../../hooks/use-tracking";
import { LinkedAssetsTable } from "./linked-assets-table";
import {
  countAssetTicketsByStatus,
  type DetailAssetTicket,
  sortAssetTicketsByStatus,
  statusHue,
  statusLabels,
} from "./shared";

const AssetProgressStrip = ({
  assetTickets,
}: {
  assetTickets: DetailAssetTicket[];
}) => {
  const total = assetTickets.length;
  if (total === 0) return null;
  const counts = countAssetTicketsByStatus(assetTickets);
  const done = counts.find((c) => c.status === TicketStatus.DONE)?.count ?? 0;
  const pctResolved = Math.round((done / total) * 100);

  return (
    <div className="border-b px-5 py-4">
      <p className="text-sm">
        <span className="font-semibold">{pctResolved}% resolved</span>
        <span className="text-muted-foreground">
          {" "}
          — {done} of {total} done
        </span>
      </p>
      <div className="mt-2 flex h-2 w-full overflow-hidden rounded-full bg-muted">
        {counts.map(({ status, count }) => (
          <div
            key={status}
            className={getSwatchClass(statusHue[status])}
            style={{ width: `${(count / total) * 100}%` }}
          />
        ))}
      </div>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        {counts.map(({ status, count }) => (
          <span key={status} className="inline-flex items-center gap-1.5">
            <span
              className={cn(
                "size-2 rounded-full",
                getSwatchClass(statusHue[status]),
              )}
            />
            {count} {statusLabels[status]}
          </span>
        ))}
      </div>
    </div>
  );
};

const AttachAssetPopover = ({ ticketId }: { ticketId: string }) => {
  const [open, setOpen] = useState(false);
  const { data: candidates } = useAttachableAssets(ticketId);
  const attach = useAttachAsset(ticketId);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button size="sm" variant="outline">
          <PlusIcon className="size-3.5" />
          Add asset
        </Button>
      </PopoverTrigger>
      <PopoverContent className="p-0 w-96" align="end">
        <Command>
          <CommandInput placeholder="Search assets..." />
          <CommandList>
            <CommandEmpty>No eligible assets found.</CommandEmpty>
            <CommandGroup>
              {(candidates ?? []).map((a) => {
                const label = a.hostname ?? a.ip;
                const model = [
                  a.deviceGroup?.manufacturer?.canonicalDisplayName,
                  a.deviceGroup?.product?.canonicalDisplayName,
                ]
                  .filter(Boolean)
                  .join(" ");
                const sub = [a.role, model].filter(Boolean).join(" · ");
                return (
                  <CommandItem
                    key={a.id}
                    value={`${a.hostname ?? ""} ${a.ip} ${a.role ?? ""}`}
                    onSelect={() => {
                      attach.mutate(
                        { ticketId, assetId: a.id },
                        { onSuccess: () => setOpen(false) },
                      );
                    }}
                    disabled={attach.isPending}
                  >
                    <div className="flex flex-col min-w-0 flex-1">
                      <span className="truncate font-medium">{label}</span>
                      {sub && (
                        <span className="text-xs text-muted-foreground truncate">
                          {sub}
                        </span>
                      )}
                    </div>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
};

export const LinkedAssetsTabContent = ({
  ticketId,
  assetTickets,
}: {
  ticketId: string;
  assetTickets: DetailAssetTicket[];
}) => {
  const detach = useDetachAsset(ticketId);
  const sortedAssetTickets = sortAssetTicketsByStatus(assetTickets);

  return (
    <Card className="gap-0 py-0">
      <div className="flex items-center justify-between gap-2 border-b px-5 py-4">
        <h2 className="text-base font-semibold">
          Linked Assets{" "}
          <span className="text-muted-foreground">({assetTickets.length})</span>
        </h2>
        <AttachAssetPopover ticketId={ticketId} />
      </div>
      <AssetProgressStrip assetTickets={sortedAssetTickets} />
      <div className="p-2">
        {assetTickets.length > 0 ? (
          <LinkedAssetsTable
            parentTicketId={ticketId}
            assetTickets={sortedAssetTickets}
            onDetach={(assetId) => detach.mutate({ ticketId, assetId })}
            detachPending={detach.isPending}
          />
        ) : (
          <p className="p-4 text-sm text-muted-foreground">
            No assets linked to this ticket.
          </p>
        )}
      </div>
    </Card>
  );
};
