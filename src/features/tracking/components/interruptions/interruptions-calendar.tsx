"use client";

import { useQuery } from "@tanstack/react-query";
import {
  addDays,
  addMonths,
  addWeeks,
  eachDayOfInterval,
  endOfDay,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  isToday,
  isValid,
  parse,
  setHours,
  startOfDay,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { parseAsString, parseAsStringLiteral, useQueryState } from "nuqs";
import { type ReactNode, Suspense, useEffect, useState } from "react";
import { ErrorView, LoadingView } from "@/components/entity-components";
import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  CategoryColorProvider,
  useCategoryColor,
} from "@/features/tag-colors/context";
import { getChipClass } from "@/features/tag-colors/palette";
import type { TicketCategory } from "@/generated/prisma";
import { cn } from "@/lib/utils";
import { useTRPC } from "@/trpc/client";
import { statusLabels } from "../ticket-detail/shared";
import { type DrawerTicket, TicketDrawer } from "./ticket-drawer";

const DATE_FORMAT = "yyyy-MM-dd";
const HOUR_HEIGHT = 72;
const HOURS = Array.from({ length: 24 }, (_, hour) => hour);
// Every block is this tall, in minutes.
const BLOCK_MINUTES = 60;

type Item = DrawerTicket & { workOrderId: string; category: TicketCategory };
type Block = {
  item: Item;
  start: number;
  len: number;
  lane: number;
  lanes: number;
};

// One block per event on this day. An event that runs past midnight continues
// at the top of the next day. Blocks that overlap sit in separate lanes.
const layout = (day: Date, items: Item[]): Block[] => {
  const dayMinutes = 24 * 60;
  const blocks = items
    .flatMap((item) => {
      const start = minutesOf(item.scheduledAt);
      const spill = start + BLOCK_MINUTES - dayMinutes;
      if (isSameDay(item.scheduledAt, day)) {
        return [
          { item, start, len: Math.min(BLOCK_MINUTES, dayMinutes - start) },
        ];
      }
      return spill > 0 && isSameDay(addDays(item.scheduledAt, 1), day)
        ? [{ item, start: 0, len: spill }]
        : [];
    })
    .map((block) => ({ ...block, lane: 0, lanes: 1 }))
    .sort((a, b) => a.start - b.start);
  const laneEnds: number[] = [];
  for (const block of blocks) {
    const free = laneEnds.findIndex((end) => end <= block.start);
    block.lane = free < 0 ? laneEnds.length : free;
    laneEnds[block.lane] = block.start + block.len;
  }
  for (const block of blocks) block.lanes = laneEnds.length;
  return blocks;
};

// The category-colored button that opens an event's drawer.
const ItemButton = ({
  item,
  className,
  children,
}: {
  item: Item;
  className: string;
  children: ReactNode;
}) => {
  const color = useCategoryColor(item.category);
  return (
    <TicketDrawer ticket={item}>
      <button
        type="button"
        title={item.summary}
        className={cn(
          "overflow-hidden rounded border border-l-4 text-left text-[11px] hover:brightness-95",
          getChipClass(color),
          className,
        )}
      >
        {children}
      </button>
    </TicketDrawer>
  );
};

const TicketBlock = ({
  block: { item, start, len, lane, lanes },
}: {
  block: Block;
}) => (
  <div
    className="absolute"
    style={{
      left: `calc(${(lane * 100) / lanes}% + 2px)`,
      width: `calc(${100 / lanes}% - 4px)`,
      top: (start * HOUR_HEIGHT) / 60,
      height: (len * HOUR_HEIGHT) / 60 - 2,
    }}
  >
    <ItemButton
      item={item}
      className="flex h-full w-full flex-col gap-0.5 rounded-md px-1.5 py-0.5 leading-tight"
    >
      <span className="truncate text-xs font-medium">
        {item.assetName} • {item.summary}
      </span>
      <span className="truncate">
        {format(item.scheduledAt, "h:mm a")} · {statusLabels[item.status]}
      </span>
    </ItemButton>
  </div>
);

const MAX_CHIPS = 3;

const MonthChip = ({ item }: { item: Item }) => (
  <ItemButton item={item} className="truncate px-1">
    {format(item.scheduledAt, "h:mmaaa")} {item.assetName} • {item.summary}
  </ItemButton>
);

const MonthGrid = ({
  days,
  on,
  month,
  onDay,
}: {
  days: Date[];
  on: (day: Date) => Item[];
  month: Date;
  onDay: (day: Date) => void;
}) => (
  <div className="flex min-h-0 flex-1 flex-col overflow-auto rounded-lg border bg-card">
    <div
      aria-hidden
      className="grid grid-cols-7 border-b text-center text-sm text-muted-foreground"
    >
      {days.slice(0, 7).map((day) => (
        <div key={day.getDay()} className="py-1.5">
          {format(day, "EEE")}
        </div>
      ))}
    </div>
    <div className="grid flex-1 auto-rows-fr grid-cols-7">
      {days.map((day) => {
        const events = on(day);
        return (
          <section
            key={day.toISOString()}
            aria-label={format(day, "EEEE, MMMM d")}
            className={cn(
              "flex min-h-24 min-w-0 flex-col gap-0.5 border-t border-l p-1",
              !isSameMonth(day, month) && "bg-muted/40 text-muted-foreground",
            )}
          >
            <h2
              className={cn(
                "w-fit px-1 text-xs font-semibold",
                isToday(day) &&
                  "rounded-full bg-primary text-primary-foreground",
              )}
            >
              {format(day, "d")}
            </h2>
            {events.slice(0, MAX_CHIPS).map((item) => (
              <MonthChip key={item.id} item={item} />
            ))}
            {events.length > MAX_CHIPS && (
              <button
                type="button"
                className="text-left text-xs text-muted-foreground underline"
                onClick={() => onDay(day)}
              >
                +{events.length - MAX_CHIPS} more
              </button>
            )}
          </section>
        );
      })}
    </div>
  </div>
);

// Open the grid at the working day, not midnight.
const scrollToWorkday = (el: HTMLDivElement | null) => {
  if (el) el.scrollTop = 7 * HOUR_HEIGHT;
};

const minutesOf = (date: Date) => date.getHours() * 60 + date.getMinutes();

// Ticks on its own, so only the line re-renders each minute, not the calendar.
const NowLine = () => {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const tick = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(tick);
  }, []);
  return (
    <div
      aria-hidden
      className="absolute inset-x-0 z-10 border-t-2 border-destructive before:absolute before:-top-[6px] before:-left-1 before:size-2.5 before:rounded-full before:bg-destructive"
      style={{ top: (minutesOf(now) * HOUR_HEIGHT) / 60 }}
    />
  );
};

const Calendar = () => {
  // yyyy-MM-dd; no date means today. `view` defaults to the week.
  const [date, setDate] = useQueryState("date", parseAsString);
  const [mode, setMode] = useQueryState(
    "view",
    parseAsStringLiteral(["day", "week", "month"] as const).withDefault("week"),
  );
  const trpc = useTRPC();

  const parsed = parse(date ?? "", DATE_FORMAT, new Date());
  const anchor = startOfDay(isValid(parsed) ? parsed : new Date());
  // A month shows whole weeks, so its edges spill into the neighbouring months.
  const [start, end] = {
    day: [anchor, endOfDay(anchor)],
    week: [startOfWeek(anchor), endOfWeek(anchor)],
    month: [startOfWeek(startOfMonth(anchor)), endOfWeek(endOfMonth(anchor))],
  }[mode];
  const days = eachDayOfInterval({ start, end });
  const { data: items, isError } = useQuery(
    trpc.tracking.getInterruptionCalendar.queryOptions({
      from: start,
      to: end,
    }),
  );
  const on = (day: Date) =>
    (items ?? []).filter((item) => isSameDay(item.scheduledAt, day));
  const step = (n: number) =>
    setDate(
      format(
        { day: addDays, week: addWeeks, month: addMonths }[mode](anchor, n),
        DATE_FORMAT,
      ),
    );

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 px-4 pt-3 pb-4">
      <nav
        aria-label="Calendar navigation"
        className="flex flex-wrap items-center justify-end gap-1"
      >
        <Button variant="outline" size="sm" onClick={() => setDate(null)}>
          Today
        </Button>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Previous"
          onClick={() => step(-1)}
        >
          <ChevronLeftIcon aria-hidden />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Next"
          onClick={() => step(1)}
        >
          <ChevronRightIcon aria-hidden />
        </Button>
        <span aria-live="polite" className="mx-2 text-sm font-medium">
          {mode === "day" && format(start, "EEE, MMM d, yyyy")}
          {mode === "month" && format(anchor, "MMMM yyyy")}
          {mode === "week" &&
            `${format(start, "MMM d")} – ${format(end, "MMM d, yyyy")}`}
        </span>
        <ToggleGroup
          type="single"
          variant="outline"
          size="sm"
          value={mode}
          onValueChange={(v) => v && setMode(v as typeof mode)}
        >
          <ToggleGroupItem value="day">Day</ToggleGroupItem>
          <ToggleGroupItem value="week">Week</ToggleGroupItem>
          <ToggleGroupItem value="month">Month</ToggleGroupItem>
        </ToggleGroup>
      </nav>

      {isError ? (
        <ErrorView message="Error loading maintenance" />
      ) : !items ? (
        <LoadingView message="Loading maintenance..." />
      ) : (
        <>
          {items.length === 0 && (
            <p className="text-sm text-muted-foreground">
              No maintenance scheduled here. Check that you are assigned to a
              department.
            </p>
          )}
          {mode === "month" ? (
            <MonthGrid
              days={days}
              on={on}
              month={anchor}
              onDay={(day) => {
                setDate(format(day, DATE_FORMAT));
                setMode("day");
              }}
            />
          ) : (
            <div
              ref={scrollToWorkday}
              className="min-h-0 flex-1 overflow-auto rounded-lg border bg-card"
            >
              <div className="flex">
                <div aria-hidden className="w-14 shrink-0">
                  <div className="sticky top-0 z-20 h-9 border-b bg-card" />
                  {HOURS.map((hour) => (
                    <div
                      key={hour}
                      style={{ height: HOUR_HEIGHT }}
                      className="relative text-right text-xs text-muted-foreground"
                    >
                      {hour > 0 && (
                        <span className="absolute -top-2 right-2">
                          {format(setHours(new Date(0), hour), "h a")}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
                {days.map((day) => (
                  <section
                    key={day.toISOString()}
                    aria-label={format(day, "EEEE, MMMM d")}
                    className={cn(
                      "min-w-36 flex-1 border-l",
                      isToday(day) && "bg-primary/5",
                    )}
                  >
                    <h2 className="sticky top-0 z-20 flex h-9 items-center justify-center gap-1.5 border-b bg-card px-2 text-sm">
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
                      style={{
                        height: HOURS.length * HOUR_HEIGHT,
                        backgroundImage: `repeating-linear-gradient(to bottom, var(--border) 0px, var(--border) 1px, transparent 1px, transparent ${HOUR_HEIGHT}px)`,
                      }}
                    >
                      {isToday(day) && <NowLine />}
                      {layout(day, items).map((block) => (
                        <TicketBlock
                          key={`${block.item.id}-${block.start}`}
                          block={block}
                        />
                      ))}
                    </div>
                  </section>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};

// The category colors are a suspense query, which cannot run unauthenticated
// during SSR, so the calendar renders on the client only.
export const InterruptionsCalendar = () => {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted ? (
    <Suspense fallback={<LoadingView message="Loading maintenance..." />}>
      <CategoryColorProvider>
        <Calendar />
      </CategoryColorProvider>
    </Suspense>
  ) : (
    <LoadingView message="Loading maintenance..." />
  );
};
