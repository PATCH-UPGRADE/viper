"use client";

import { useQuery } from "@tanstack/react-query";
import {
  addWeeks,
  eachDayOfInterval,
  endOfWeek,
  format,
  isSameDay,
  isToday,
  isValid,
  parse,
  setHours,
  startOfDay,
  startOfWeek,
} from "date-fns";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { parseAsString, useQueryState } from "nuqs";
import { useEffect, useRef } from "react";
import { ErrorView, LoadingView } from "@/components/entity-components";
import { Button } from "@/components/ui/button";
import { getChipClass } from "@/features/tag-colors/palette";
import { cn, plural } from "@/lib/utils";
import { useTRPC } from "@/trpc/client";
import { statusHue, statusLabels } from "../ticket-detail/shared";
import { type DrawerTicket, TicketDrawer } from "./ticket-drawer";

const DATE_FORMAT = "yyyy-MM-dd";
const HOUR_HEIGHT = 72;
const HOURS = Array.from({ length: 24 }, (_, hour) => hour);
// Every block is this tall, in minutes.
const BLOCK_MINUTES = 60;

// Tickets starting in the same clock hour sit side by side.
const sideBySide = (items: DrawerTicket[]) =>
  items.map((item) => {
    const hour = item.scheduledAt.getHours();
    const group = items.filter(
      (other) => other.scheduledAt.getHours() === hour,
    );
    return { item, index: group.indexOf(item), count: group.length };
  });

const minutesOf = (date: Date) => date.getHours() * 60 + date.getMinutes();

export const InterruptionsCalendar = () => {
  // yyyy-MM-dd; no date means today.
  const [date, setDate] = useQueryState("date", parseAsString);
  const trpc = useTRPC();
  const scroller = useRef<HTMLDivElement>(null);

  const parsed = parse(date ?? "", DATE_FORMAT, new Date());
  const anchor = startOfDay(isValid(parsed) ? parsed : new Date());
  const start = startOfWeek(anchor);
  const end = endOfWeek(anchor);
  const { data: items, isError } = useQuery(
    trpc.tracking.getInterruptionCalendar.queryOptions({
      from: start,
      to: end,
    }),
  );
  const go = (day: Date) => setDate(format(day, DATE_FORMAT));

  // Open at the working day, not midnight.
  // biome-ignore lint/correctness/useExhaustiveDependencies: runs when the grid first appears
  useEffect(() => {
    if (scroller.current) scroller.current.scrollTop = 7 * HOUR_HEIGHT;
  }, [Boolean(items)]);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 px-4 pt-3 pb-4">
      <header className="flex flex-wrap items-center gap-3">
        <h1 className="text-sm font-semibold">Device Maintenance</h1>
        <p className="hidden text-sm text-muted-foreground md:block">
          Open work orders for devices in your departments.
        </p>
        <nav
          aria-label="Week navigation"
          className="ml-auto flex items-center gap-1"
        >
          <Button variant="outline" onClick={() => setDate(null)}>
            Today
          </Button>
          <Button
            variant="outline"
            size="icon"
            aria-label="Previous week"
            onClick={() => go(addWeeks(anchor, -1))}
          >
            <ChevronLeftIcon aria-hidden />
          </Button>
          <Button
            variant="outline"
            size="icon"
            aria-label="Next week"
            onClick={() => go(addWeeks(anchor, 1))}
          >
            <ChevronRightIcon aria-hidden />
          </Button>
          <span aria-live="polite" className="ml-2 text-sm font-medium">
            {format(start, "MMM d")} – {format(end, "MMM d, yyyy")}
            {items && ` · ${items.length} ${plural("ticket", items.length)}`}
          </span>
        </nav>
      </header>

      {isError ? (
        <ErrorView message="Error loading maintenance" />
      ) : !items ? (
        <LoadingView message="Loading maintenance..." />
      ) : (
        <>
          {items.length === 0 && (
            <p className="text-sm text-muted-foreground">
              No maintenance is scheduled this week for the devices your
              department manages. If you expect to see some, check that you are
              assigned to a department.
            </p>
          )}
          <div
            ref={scroller}
            className="min-h-0 flex-1 overflow-auto rounded-lg border bg-card"
          >
            <div className="flex">
              <div aria-hidden className="w-14 shrink-0">
                <div className="sticky top-0 z-20 h-9 border-b bg-card" />
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
              {eachDayOfInterval({ start, end }).map((day) => (
                <section
                  key={day.toISOString()}
                  aria-label={format(day, "EEEE, MMMM d")}
                  className={cn(
                    "min-w-36 flex-1 border-l",
                    isToday(day) && "bg-primary/5",
                  )}
                >
                  <h2 className="sticky top-0 z-20 flex h-9 items-center gap-1.5 border-b bg-card px-2 text-sm">
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
                  </h2>
                  <div
                    className="relative"
                    style={{ height: HOURS.length * HOUR_HEIGHT }}
                  >
                    {HOURS.map((hour) => (
                      <div
                        key={hour}
                        aria-hidden
                        style={{ height: HOUR_HEIGHT }}
                        className="border-t first:border-t-0"
                      />
                    ))}
                    {isToday(day) && (
                      <div
                        aria-hidden
                        className="absolute inset-x-0 z-10 border-t-2 border-destructive"
                        style={{
                          top: (minutesOf(new Date()) * HOUR_HEIGHT) / 60,
                        }}
                      />
                    )}
                    {/* Tickets starting in the same hour share its width. */}
                    {sideBySide(
                      items.filter((item) => isSameDay(item.scheduledAt, day)),
                    ).map(({ item, index, count }) => (
                      <div
                        key={item.id}
                        className="absolute"
                        style={{
                          left: `calc(${(index * 100) / count}% + 2px)`,
                          width: `calc(${100 / count}% - 4px)`,
                          top: (minutesOf(item.scheduledAt) * HOUR_HEIGHT) / 60,
                          height: (BLOCK_MINUTES * HOUR_HEIGHT) / 60 - 2,
                        }}
                      >
                        <TicketDrawer ticket={item}>
                          <button
                            type="button"
                            title={item.summary}
                            className={cn(
                              "flex h-full w-full flex-col gap-0.5 overflow-hidden rounded-md border px-1.5 py-0.5 text-left text-[11px] leading-tight hover:brightness-95",
                              getChipClass(statusHue[item.status]),
                            )}
                          >
                            <span className="truncate text-xs font-medium">
                              {item.assetName}
                            </span>
                            <span className="truncate">
                              {format(item.scheduledAt, "h:mm a")} ·{" "}
                              {statusLabels[item.status]}
                            </span>
                            <span className="truncate opacity-80">
                              {item.summary}
                            </span>
                          </button>
                        </TicketDrawer>
                      </div>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
};
