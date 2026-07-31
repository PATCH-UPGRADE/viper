"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { TicketStatus } from "@/generated/prisma";
import {
  useSuspenseAssetWorkOrders,
  useUpdateTicket,
} from "../hooks/use-tracking";

const MarkCompleteButton = ({ ticketId }: { ticketId: string }) => {
  const update = useUpdateTicket(ticketId);

  return (
    <Button
      variant="outline"
      size="sm"
      disabled={update.isPending}
      onClick={() => update.mutate({ id: ticketId, status: TicketStatus.DONE })}
    >
      Mark as complete
    </Button>
  );
};

export const AssetWorkOrders = ({ assetId }: { assetId: string }) => {
  const { data: tickets } = useSuspenseAssetWorkOrders(assetId);

  if (tickets.length === 0) {
    return (
      <p className="flex justify-center pt-24 text-muted-foreground">
        No open work orders for this asset
      </p>
    );
  }

  return (
    <ul className="divide-y rounded-md border">
      {tickets.map((ticket) => (
        <li
          key={ticket.id}
          className="flex items-center justify-between gap-4 p-3"
        >
          <Link
            href={`/tracking/${ticket.id}`}
            className="font-medium hover:underline"
          >
            {ticket.summary}
          </Link>
          <MarkCompleteButton ticketId={ticket.id} />
        </li>
      ))}
    </ul>
  );
};
