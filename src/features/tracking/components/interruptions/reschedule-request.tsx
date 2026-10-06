"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { addMinutes, format, formatDistanceToNow } from "date-fns";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { plural } from "@/lib/utils";
import { useTRPC } from "@/trpc/client";

const REASONS = [
  "Patient currently on device",
  "High census / no spare device",
  "Procedure or admission scheduled",
  "Shift change or staffing",
  "Other",
];

type Request = {
  id: string;
  suggestedAt: Date;
  reason: string;
  note: string | null;
  createdAt: Date;
};

const Suggestion = ({
  request,
  listed,
  duration,
}: {
  request: Request;
  listed: string;
  duration: number | null;
}) => (
  <div className="flex flex-col gap-1 rounded-lg border bg-muted/40 p-2">
    <span className="flex items-center justify-between gap-2">
      <span className="font-medium">
        You suggested {format(request.suggestedAt, "EEE, MMM d · h:mm a")}
        {duration &&
          ` – ${format(addMinutes(request.suggestedAt, duration), "h:mm a")}`}
      </span>
      <span className="rounded-full border border-dashed border-primary px-2 text-xs text-primary">
        Pending
      </span>
    </span>
    <span className="text-xs text-muted-foreground">
      Work order listed {listed} · sent{" "}
      {formatDistanceToNow(request.createdAt, { addSuffix: true })}
    </span>
    <span>
      {request.reason}
      {request.note && ` — ${request.note}`}
    </span>
    <span className="text-xs text-muted-foreground">
      VIPER has no recorded response yet. The work order still lists {listed}.
      If you have already agreed on a change with the maintenance team
      elsewhere, it will show here once they update the work order.
    </span>
  </div>
);

// Suggest a new time for this device.
// The schedule stays as it is until the maintenance team records a response
// outside VIPER.
export const RescheduleRequest = ({
  ticketId,
  scheduled,
  listed,
  duration,
  requests,
}: {
  ticketId: string;
  scheduled: boolean;
  listed: string;
  duration: number | null;
  requests: Request[];
}) => {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [time, setTime] = useState("");
  const [reason, setReason] = useState(REASONS[0]);
  const [note, setNote] = useState("");
  const [latest, ...past] = requests;

  const send = useMutation(
    trpc.tracking.requestReschedule.mutationOptions({
      onSuccess: () => {
        setOpen(false);
        setTime("");
        setNote("");
        queryClient.invalidateQueries(trpc.tracking.pathFilter());
      },
      onError: (error) => toast.error(`Could not send: ${error.message}`),
    }),
  );

  return (
    <div className="flex flex-col gap-2 text-sm">
      {latest && (
        <Suggestion request={latest} listed={listed} duration={duration} />
      )}
      {past.length > 0 && (
        <details className="rounded-lg border">
          <summary className="cursor-pointer px-3 py-2">
            {past.length} past reschedule {plural("request", past.length)}
          </summary>
          <div className="flex flex-col gap-2 p-2">
            {past.map((r) => (
              <Suggestion
                key={r.id}
                request={r}
                listed={listed}
                duration={duration}
              />
            ))}
          </div>
        </details>
      )}
      {open ? (
        <form
          className="flex flex-col gap-2 rounded-lg border p-3"
          onSubmit={(e) => {
            e.preventDefault();
            send.mutate({
              ticketId,
              suggestedAt: new Date(time),
              reason,
              note: note || undefined,
            });
          }}
        >
          <label className="flex flex-col gap-1">
            Suggested time
            <input
              required
              type="datetime-local"
              value={time}
              onChange={(e) => setTime(e.target.value)}
              className="rounded-md border bg-background px-2 py-1"
            />
          </label>
          <label className="flex flex-col gap-1">
            Reason
            <select
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="rounded-md border bg-background px-2 py-1"
            >
              {REASONS.map((r) => (
                <option key={r}>{r}</option>
              ))}
            </select>
          </label>
          <Textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={1_000}
            rows={2}
            placeholder="Optional details for the maintenance team"
          />
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={send.isPending}>
              Send request
            </Button>
          </div>
        </form>
      ) : (
        <Button
          variant="outline"
          className="w-fit"
          onClick={() => {
            if (latest)
              setTime(format(latest.suggestedAt, "yyyy-MM-dd'T'HH:mm"));
            setOpen(true);
          }}
        >
          {scheduled ? "Request reschedule" : "Suggest a time"}
        </Button>
      )}
    </div>
  );
};
