"use client";

import { cn, plural } from "@/lib/utils";
import { useInterruptionCalendar } from "../../hooks/use-interruptions";
import { useInterruptionsParams } from "../../hooks/use-interruptions-params";
import {
  parseAnchor,
  visibleDays,
  visibleRange,
} from "../../interruptions-dates";
import {
  InterruptionsError,
  InterruptionsLoading,
  ScopeEmpty,
} from "./interruptions-states";
import { MonthGrid } from "./month-grid";
import { TimeGrid } from "./time-grid";

export const InterruptionsCalendar = () => {
  const [{ mode, date }] = useInterruptionsParams();
  const anchor = parseAnchor(date);
  const { start, end } = visibleRange(anchor, mode);
  const { data, isError, isPlaceholderData } = useInterruptionCalendar({
    from: start,
    to: end,
  });

  if (isError) return <InterruptionsError />;
  if (!data) return <InterruptionsLoading />;
  if (data.scope !== "ready") return <ScopeEmpty scope={data.scope} />;

  const days = visibleDays(anchor, mode);
  const { assetTicketCount } = data;

  return (
    <div
      aria-busy={isPlaceholderData}
      className={cn(
        "flex min-h-0 flex-1 flex-col",
        isPlaceholderData && "opacity-50",
      )}
    >
      <p
        aria-live="polite"
        className={cn(
          assetTicketCount === 0
            ? "px-4 pb-2 text-sm text-muted-foreground"
            : "sr-only",
        )}
      >
        {assetTicketCount === 0
          ? `No device maintenance scheduled this ${mode}.`
          : `${assetTicketCount} device ${plural("ticket", assetTicketCount)} scheduled this ${mode}.`}
      </p>
      <div className="mx-4 mb-4 flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border bg-card">
        {mode === "month" ? (
          <MonthGrid days={days} anchor={anchor} items={data.items} />
        ) : (
          <TimeGrid days={days} items={data.items} />
        )}
      </div>
    </div>
  );
};
