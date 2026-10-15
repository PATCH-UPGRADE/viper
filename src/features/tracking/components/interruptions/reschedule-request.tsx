"use client";

import { CalendarClockIcon, ChevronDownIcon } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { RescheduleStatus } from "@/generated/prisma";
import { authClient } from "@/lib/auth-client";
import { formatSlot, toDateTimeLocal } from "@/lib/date-utils";
import { plural } from "@/lib/utils";
import {
  useDecideReschedule,
  useRequestReschedule,
} from "../../hooks/use-tracking";

type Pending = {
  id: string;
  proposedAt: Date;
  reason: string | null;
  requestedBy: { id: string; name: string };
};

type Past = { id: string; status: RescheduleStatus; proposedAt: Date };

type Related = {
  proposedAt: Date;
  requestedBy: { name: string };
  onWorkOrder: boolean;
};

const RequestForm = ({
  ticketId,
  scheduledAt,
}: {
  ticketId: string;
  scheduledAt: Date | null;
}) => {
  const [open, setOpen] = useState(false);
  const [proposedAt, setProposedAt] = useState("");
  const [reason, setReason] = useState("");
  const request = useRequestReschedule();

  // Start from the ticket's time, or from now when that has passed.
  const openForm = () => {
    const now = new Date();
    setProposedAt(
      toDateTimeLocal(scheduledAt && scheduledAt > now ? scheduledAt : now),
    );
    setOpen(true);
  };

  if (!open) {
    return (
      <Button size="sm" variant="outline" className="w-fit" onClick={openForm}>
        <CalendarClockIcon className="size-4" aria-hidden />
        Request reschedule
      </Button>
    );
  }
  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        request.mutate({ ticketId, proposedAt: new Date(proposedAt), reason });
      }}
    >
      <Input
        type="datetime-local"
        aria-label="New time"
        required
        min={toDateTimeLocal(new Date())}
        value={proposedAt}
        onChange={(e) => setProposedAt(e.target.value)}
      />
      <Textarea
        aria-label="Why?"
        placeholder="Why? (optional)"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
      />
      <div className="flex gap-2">
        <Button size="sm" type="submit" disabled={request.isPending}>
          Send
        </Button>
        <Button
          size="sm"
          type="button"
          variant="ghost"
          onClick={() => setOpen(false)}
        >
          Cancel
        </Button>
      </div>
    </form>
  );
};

const PendingRequest = ({ pending }: { pending: Pending }) => {
  const [reason, setReason] = useState("");
  const decide = useDecideReschedule();
  const { data: session } = authClient.useSession();
  const time = formatSlot(pending.proposedAt);
  const mine = pending.requestedBy.id === session?.user.id;

  return (
    <>
      <p>
        {mine
          ? `You asked for ${time}. Waiting for approval.`
          : `${pending.requestedBy.name} asked to move this to ${time}`}
      </p>
      {pending.reason && (
        <p className="text-muted-foreground">{pending.reason}</p>
      )}
      {session && (
        <>
          <Textarea
            aria-label="Reason"
            placeholder={
              mine
                ? "Reason for cancelling (optional)"
                : "Reason, if you decline (optional)"
            }
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
          <div className="flex gap-2">
            {mine ? (
              <Button
                size="sm"
                variant="outline"
                disabled={decide.isPending}
                onClick={() =>
                  decide.mutate({
                    requestId: pending.id,
                    decision: "cancel",
                    reason,
                  })
                }
              >
                Cancel request
              </Button>
            ) : (
              <>
                <Button
                  size="sm"
                  disabled={decide.isPending}
                  onClick={() =>
                    decide.mutate({
                      requestId: pending.id,
                      decision: "approve",
                    })
                  }
                >
                  Approve
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={decide.isPending}
                  onClick={() =>
                    decide.mutate({
                      requestId: pending.id,
                      decision: "decline",
                      reason,
                    })
                  }
                >
                  Decline
                </Button>
              </>
            )}
          </div>
        </>
      )}
    </>
  );
};

// Sits in the drawer's schedule card, under the schedule and duration.
export const RescheduleRequest = ({
  ticketId,
  scheduledAt,
  pending,
  related,
  past,
}: {
  ticketId: string;
  scheduledAt: Date | null;
  pending: Pending | null;
  related: Related | null;
  past: Past[];
}) => (
  <>
    <div className="flex flex-col gap-2 border-t p-3">
      {pending ? (
        <PendingRequest pending={pending} />
      ) : (
        <RequestForm ticketId={ticketId} scheduledAt={scheduledAt} />
      )}
      {related && (
        <p className="text-xs text-muted-foreground">
          {related.onWorkOrder ? "The work order" : "A device ticket"} also has
          a reschedule pending: {formatSlot(related.proposedAt)}, asked by{" "}
          {related.requestedBy.name}
        </p>
      )}
    </div>
    {past.length > 0 && (
      <details className="group border-t bg-muted/40">
        <summary className="flex cursor-pointer list-none items-center justify-between px-3 py-2 text-muted-foreground [&::-webkit-details-marker]:hidden">
          {past.length} past reschedule {plural("request", past.length)}
          <ChevronDownIcon
            className="size-4 transition-transform group-open:rotate-180"
            aria-hidden
          />
        </summary>
        <ul className="divide-y border-t">
          {past.map((r) => (
            <li key={r.id} className="flex justify-between px-3 py-2">
              {formatSlot(r.proposedAt)}
              <span className="text-muted-foreground">
                {r.status[0] + r.status.slice(1).toLowerCase()}
              </span>
            </li>
          ))}
        </ul>
      </details>
    )}
  </>
);
