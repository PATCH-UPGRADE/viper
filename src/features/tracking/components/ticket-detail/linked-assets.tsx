"use client";

import { Card } from "@/components/ui/card";
import { getSwatchClass } from "@/features/tag-colors/palette";
import { TicketStatus } from "@/generated/prisma";
import { cn } from "@/lib/utils";
import {
  useAttachAsset,
  useDetachAsset,
  useSuspenseOtherAssetWorkOrders,
} from "../../hooks/use-tracking";
import { AssetPickerPopover } from "./asset-picker-popover";
import { LinkedAssetsTable } from "./linked-assets-table";
import { OtherAssetWorkOrdersCard } from "./other-asset-work-orders";
import { countOtherWorkOrdersByAsset } from "./other-work-order-groups";
import {
  countAssetTicketsByStatus,
  type DetailAssetTicket,
  sortAssetTicketsByStatus,
  statusHue,
  statusLabels,
  useReadOnly,
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
  const attach = useAttachAsset(ticketId);
  return (
    <AssetPickerPopover
      ticketId={ticketId}
      pending={attach.isPending}
      onSelect={(asset, close) =>
        attach.mutate({ ticketId, assetId: asset.id }, { onSuccess: close })
      }
    />
  );
};

export const LinkedAssetsTabContent = ({
  ticketId,
  assetTickets,
}: {
  ticketId: string;
  assetTickets: DetailAssetTicket[];
}) => {
  const readOnly = useReadOnly();
  const detach = useDetachAsset(ticketId);
  const sortedAssetTickets = sortAssetTicketsByStatus(assetTickets);
  const { data: otherWorkOrders } = useSuspenseOtherAssetWorkOrders(ticketId);

  return (
    <>
      <Card className="gap-0 py-0">
        <div className="flex items-center justify-between gap-2 border-b px-5 py-4">
          <h2 className="text-base font-semibold">
            Linked Assets{" "}
            <span className="text-muted-foreground">
              ({assetTickets.length})
            </span>
          </h2>
          {!readOnly && <AttachAssetPopover ticketId={ticketId} />}
        </div>
        <AssetProgressStrip assetTickets={sortedAssetTickets} />
        <div className="p-2">
          {assetTickets.length > 0 ? (
            <LinkedAssetsTable
              parentTicketId={ticketId}
              assetTickets={sortedAssetTickets}
              otherWorkOrderCounts={countOtherWorkOrdersByAsset(
                otherWorkOrders,
              )}
              onDetach={
                readOnly
                  ? undefined
                  : (assetId) => detach.mutate({ ticketId, assetId })
              }
              detachPending={detach.isPending}
            />
          ) : (
            <p className="p-4 text-sm text-muted-foreground">
              No assets linked to this ticket.
            </p>
          )}
        </div>
      </Card>
      {assetTickets.length > 0 && (
        <OtherAssetWorkOrdersCard
          assetTickets={sortedAssetTickets}
          workOrders={otherWorkOrders}
        />
      )}
    </>
  );
};
