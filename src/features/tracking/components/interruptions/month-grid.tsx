"use client";

import { format, isSameMonth, isToday } from "date-fns";
import { cn } from "@/lib/utils";
import { bucketByDay, toDateParam } from "../../interruptions-dates";
import type { InterruptionCalendarItem } from "../../server/interruptions";
import { CompactEntry } from "./interruption-entry";

export const MonthGrid = ({
  days,
  anchor,
  items,
}: {
  days: Date[];
  anchor: Date;
  items: InterruptionCalendarItem[];
}) => {
  const buckets = bucketByDay(items);
  const weekdays = days.slice(0, 7);

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-auto">
      <div className="grid grid-cols-7 border-b text-sm font-medium">
        {weekdays.map((day) => (
          <div key={format(day, "EEE")} className="px-2 py-1.5">
            {format(day, "EEE")}
          </div>
        ))}
      </div>
      <div className="grid flex-1 grid-cols-7 auto-rows-fr">
        {days.map((day) => (
          // biome-ignore lint/a11y/useSemanticElements: a fieldset is for form controls; this names one day's cell
          <div
            key={toDateParam(day)}
            role="group"
            aria-label={format(day, "EEEE, MMMM d")}
            className={cn(
              "flex min-h-28 min-w-0 flex-col gap-0.5 border-b border-l p-1",
              !isSameMonth(day, anchor) && "bg-muted/40",
            )}
          >
            <span
              aria-current={isToday(day) ? "date" : undefined}
              className={cn(
                "w-fit px-1 text-xs",
                isToday(day)
                  ? "rounded-full bg-primary font-bold text-primary-foreground"
                  : "text-muted-foreground",
              )}
            >
              {format(day, "d")}
              {isToday(day) && <span className="sr-only"> (today)</span>}
            </span>
            {(buckets.get(toDateParam(day)) ?? []).map((item) => (
              <CompactEntry key={item.id} item={item} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
};
