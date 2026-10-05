"use client";

import { useQuery } from "@tanstack/react-query";
import { format, formatDistanceToNow } from "date-fns";
import { ChevronDownIcon, ClockIcon, SquareCheckBigIcon } from "lucide-react";
import { ErrorView, LoadingView } from "@/components/entity-components";
import { Badge } from "@/components/ui/badge";
import { plural } from "@/lib/utils";
import { useTRPC } from "@/trpc/client";
import {
  availabilityStyle,
  categoryLabels,
  END_PASSED,
  endPassed,
  StatusChip,
  statusLabels,
  UnreadDot,
} from "../ticket-detail/shared";
import { TicketDrawer } from "./ticket-drawer";

const COLUMNS =
  "grid grid-cols-[minmax(0,1fr)_14rem_8rem] items-center gap-x-4 px-4";

export const InterruptionsList = () => {
  const trpc = useTRPC();
  const { data, isError } = useQuery(
    trpc.tracking.getInterruptionList.queryOptions(),
  );
  if (isError) return <ErrorView message="Error loading maintenance" />;
  if (!data) return <LoadingView message="Loading maintenance..." />;
  if (data.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No maintenance scheduled. Check that you are assigned to a department.
      </p>
    );
  }

  return (
    <div className="min-h-0 flex-1 overflow-auto rounded-lg border bg-card">
      <div
        className={`${COLUMNS} sticky top-0 z-10 border-b bg-card py-2 text-xs text-muted-foreground`}
      >
        <span>Work order / asset</span>
        <span>Scheduled (per work order)</span>
        <span>Estimate</span>
      </div>
      {[...Map.groupBy(data, (item) => item.workOrderId).values()].map(
        (group) => {
          const [head] = group;
          const availability = availabilityStyle(head.availability);
          const times = group
            .flatMap((i) => i.scheduledAt ?? [])
            .sort((a, b) => +a - +b);
          const first = times[0];
          const last = times.at(-1);
          const late = group.filter(endPassed).length;
          return (
            <details
              key={head.workOrderId}
              className="group border-b last:border-b-0"
            >
              <summary
                className={`${COLUMNS} cursor-pointer bg-muted/40 py-3 hover:bg-accent`}
              >
                <span className="flex min-w-0 items-start gap-2">
                  <ChevronDownIcon
                    aria-hidden
                    className="mt-0.5 size-4 shrink-0 -rotate-90 text-muted-foreground transition-transform group-open:rotate-0"
                  />
                  <SquareCheckBigIcon
                    aria-hidden
                    className="mt-0.5 size-4 shrink-0 text-muted-foreground"
                  />
                  <span className="flex min-w-0 flex-col gap-1">
                    <span className="flex items-center gap-1.5 font-semibold">
                      {group.some((i) => i.unread) && <UnreadDot />}
                      <span className="truncate">{head.workOrderSummary}</span>
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {categoryLabels[head.category]} · {group.length} asset{" "}
                      {plural("ticket", group.length)}
                    </span>
                    <span className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <Badge
                        variant="outline"
                        className={availability.className}
                      >
                        <availability.Icon aria-hidden />
                        {availability.label}
                      </Badge>
                      {Object.entries(Object.groupBy(group, (i) => i.status))
                        .map(
                          ([status, items]) =>
                            `${items?.length} ${statusLabels[status as keyof typeof statusLabels]}`,
                        )
                        .join(" · ")}
                      {late > 0 && ` · ${late} past estimated end`}
                    </span>
                  </span>
                </span>
                <span className="text-sm text-muted-foreground">
                  {first && last
                    ? `${format(first, "MMM d")}${format(first, "MMM d") === format(last, "MMM d") ? "" : ` – ${format(last, "MMM d")}`} · ${times.length} of ${group.length} have a time`
                    : "No time recorded"}
                </span>
                <span className="text-sm text-muted-foreground">
                  {head.durationEstimate
                    ? `${head.durationEstimate} min each`
                    : "Duration unknown"}
                </span>
              </summary>
              <ul className="divide-y border-t">
                {group.map((item) => (
                  <li key={item.id}>
                    <TicketDrawer ticket={item}>
                      <button
                        type="button"
                        className={`${COLUMNS} w-full py-3 pl-10 text-left text-sm hover:bg-accent`}
                      >
                        <span className="flex min-w-0 flex-col items-start gap-1">
                          <span className="flex items-center gap-1.5 font-medium">
                            {item.unread && <UnreadDot />}
                            {item.assetName}
                          </span>
                          <StatusChip status={item.status} />
                        </span>
                        <span className="flex flex-col">
                          {item.scheduledAt ? (
                            <>
                              {format(item.scheduledAt, "EEE, MMM d · h:mm a")}
                              {item.scheduledAt < new Date() && (
                                <span className="text-xs text-muted-foreground">
                                  {formatDistanceToNow(item.scheduledAt, {
                                    addSuffix: true,
                                  })}
                                </span>
                              )}
                            </>
                          ) : (
                            <span className="italic text-muted-foreground">
                              No time recorded
                            </span>
                          )}
                          {endPassed(item) && (
                            <span className="text-xs text-muted-foreground">
                              {END_PASSED}
                            </span>
                          )}
                        </span>
                        <span>
                          {item.durationEstimate ? (
                            <Badge variant="outline">
                              <ClockIcon aria-hidden />
                              {item.durationEstimate} min
                            </Badge>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </span>
                      </button>
                    </TicketDrawer>
                  </li>
                ))}
              </ul>
            </details>
          );
        },
      )}
    </div>
  );
};
