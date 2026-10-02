"use client";

import { format, isToday, setHours } from "date-fns";
import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import {
  blockMinutes,
  bucketByDay,
  toDateParam,
} from "../../interruptions-dates";
import type { InterruptionCalendarItem } from "../../server/interruptions";
import { BlockEntry } from "./interruption-entry";

const HOUR_HEIGHT = 72;
const HOURS = Array.from({ length: 24 }, (_, hour) => hour);
const FIRST_VISIBLE_HOUR = 7;

const MINUTES_PER_DAY = 24 * 60;
const pxPerMinute = HOUR_HEIGHT / 60;

export const TimeGrid = ({
  days,
  items,
}: {
  days: Date[];
  items: InterruptionCalendarItem[];
}) => {
  const scroller = useRef<HTMLDivElement>(null);
  const buckets = bucketByDay(items);

  // Start the view at the working day, not midnight.
  useEffect(() => {
    if (scroller.current) {
      scroller.current.scrollTop = FIRST_VISIBLE_HOUR * HOUR_HEIGHT;
    }
  }, []);

  return (
    <div ref={scroller} className="min-h-0 flex-1 overflow-auto">
      <div className="sticky top-0 z-20 flex min-w-fit bg-background">
        <div className="sticky left-0 z-10 w-14 shrink-0 border-b bg-background" />
        {days.map((day) => {
          return (
            <div
              key={toDateParam(day)}
              className="flex min-w-36 flex-1 items-center gap-1.5 border-b border-l px-2 py-1.5 text-sm"
              aria-current={isToday(day) ? "date" : undefined}
            >
              <span className="text-muted-foreground">
                {format(day, "EEE")}
              </span>
              <span
                className={cn(
                  "font-semibold",
                  isToday(day) &&
                    "rounded-full bg-primary px-1.5 text-primary-foreground",
                )}
              >
                {format(day, "d")}
              </span>
              {isToday(day) && <span className="sr-only">(today)</span>}
            </div>
          );
        })}
      </div>

      <div className="flex min-w-fit">
        <div
          aria-hidden
          className="sticky left-0 z-10 w-14 shrink-0 bg-background"
        >
          {HOURS.map((hour) => (
            <div
              key={hour}
              style={{ height: HOUR_HEIGHT }}
              className="pr-2 text-right text-xs text-muted-foreground"
            >
              {hour > 0 && format(setHours(new Date(0), hour), "h a")}
            </div>
          ))}
        </div>

        {days.map((day) => (
          // biome-ignore lint/a11y/useSemanticElements: a fieldset is for form controls; this names one day's column
          <div
            key={toDateParam(day)}
            role="group"
            aria-label={format(day, "EEEE, MMMM d")}
            style={{ height: HOURS.length * HOUR_HEIGHT }}
            className="relative min-w-36 flex-1 border-l"
          >
            {HOURS.map((hour) => (
              <div
                key={hour}
                aria-hidden
                style={{ height: HOUR_HEIGHT }}
                className="border-t first:border-t-0"
              />
            ))}
            {/* Tickets at the same time simply overlap. */}
            {(buckets.get(toDateParam(day)) ?? []).map((item) => {
              const startMin =
                item.scheduledAt.getHours() * 60 +
                item.scheduledAt.getMinutes();
              // Clipped at midnight, so a block never spills into the next
              // day's column.
              const minutes = Math.min(
                blockMinutes(item.durationEstimate),
                MINUTES_PER_DAY - startMin,
              );
              return (
                <BlockEntry
                  key={item.id}
                  item={item}
                  style={{
                    top: startMin * pxPerMinute,
                    left: 2,
                    right: 2,
                    height: minutes * pxPerMinute - 2,
                  }}
                />
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
};
