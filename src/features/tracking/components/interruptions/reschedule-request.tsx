"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { authClient } from "@/lib/auth-client";
import { formatScheduled, toDateTimeLocal } from "@/lib/date-utils";
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

export const RescheduleRequest = ({
  ticketId,
  pending,
}: {
  ticketId: string;
  pending: Pending | null;
}) => {
  const [open, setOpen] = useState(false);
  const [proposedAt, setProposedAt] = useState("");
  const [reason, setReason] = useState("");
  const request = useRequestReschedule();
  const decide = useDecideReschedule();
  const { data: session } = authClient.useSession();

  if (pending) {
    const time = formatScheduled(pending.proposedAt);
    const mine = pending.requestedBy.id === session?.user.id;
    const decideWith = (decision: "approve" | "decline") =>
      decide.mutate({ requestId: pending.id, decision });
    return (
      <div className="flex flex-col gap-2 rounded-lg border bg-muted/40 p-3 text-sm">
        <p>
          {mine
            ? `You asked for ${time}. Waiting for approval.`
            : `${pending.requestedBy.name} asked to move this to ${time}`}
        </p>
        {pending.reason && (
          <p className="text-muted-foreground">{pending.reason}</p>
        )}
        {session && !mine && (
          <div className="flex gap-2">
            <Button
              size="sm"
              disabled={decide.isPending}
              onClick={() => decideWith("approve")}
            >
              Approve
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={decide.isPending}
              onClick={() => decideWith("decline")}
            >
              Decline
            </Button>
          </div>
        )}
      </div>
    );
  }

  if (!open) {
    return (
      <Button
        size="sm"
        variant="outline"
        className="w-fit"
        onClick={() => setOpen(true)}
      >
        Request a new time
      </Button>
    );
  }

  return (
    <form
      className="flex flex-col gap-2 rounded-lg border p-3"
      onSubmit={(e) => {
        e.preventDefault();
        request.mutate(
          { ticketId, proposedAt: new Date(proposedAt), reason },
          {
            onSuccess: () => {
              setOpen(false);
              setProposedAt("");
              setReason("");
            },
          },
        );
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
