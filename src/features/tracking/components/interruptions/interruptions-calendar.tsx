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
type Block = { items: Item[]; start: number; lane: number; lanes: number };

// One group per work order and time, so a fleet update reads "3 devices".
const groupByWorkOrder = (items: Item[]) => {
  const groups = new Map<string, Item[]>();
  for (const item of items) {
    const key = `${item.workOrderId}|${item.scheduledAt.getTime()}`;
    const group = groups.get(key);
    if (group) group.push(item);
    else groups.set(key, [item]);
  }
  return [...groups.values()];
};

// Blocks that overlap sit in separate lanes, sharing the day's width.
const layout = (items: Item[]): Block[] => {
  const blocks = groupByWorkOrder(items)
    .map((group) => ({
      items: group,
      start: minutesOf(group[0].scheduledAt),
      lane: 0,
      lanes: 1,
    }))
    .sort((a, b) => a.start - b.start);
  const laneEnds: number[] = [];
  for (const block of blocks) {
    const free = laneEnds.findIndex((end) => end <= block.start);
    block.lane = free < 0 ? laneEnds.length : free;
    laneEnds[block.lane] = block.start + BLOCK_MINUTES;
  }
  for (const block of blocks) block.lanes = laneEnds.length;
  return blocks;
};

const deviceLabel = (group: Item[]) =>
  group.length > 1 ? `${group.length} devices` : group[0].assetName;

// The category-colored button that opens a group's drawer.
const GroupButton = ({
  group,
  className,
  children,
}: {
  group: Item[];
  className: string;
  children: ReactNode;
}) => {
  const [item] = group;
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

const TicketBlock = ({ block }: { block: Block }) => {
  const [item] = block.items;
  return (
    <div
      className="absolute"
      style={{
        left: `calc(${(block.lane * 100) / block.lanes}% + 2px)`,
        width: `calc(${100 / block.lanes}% - 4px)`,
        top: (block.start * HOUR_HEIGHT) / 60,
        height: (BLOCK_MINUTES * HOUR_HEIGHT) / 60 - 2,
      }}
    >
      <GroupButton
        group={block.items}
        className="flex h-full w-full flex-col gap-0.5 rounded-md px-1.5 py-0.5 leading-tight"
      >
        <span className="truncate text-xs font-medium">
          {deviceLabel(block.items)}
        </span>
        <span className="truncate">
          {format(item.scheduledAt, "h:mm a")}
          {block.items.length === 1 && ` · ${statusLabels[item.status]}`}
        </span>
        <span className="truncate opacity-80">{item.summary}</span>
      </GroupButton>
    </div>
  );
};

const MAX_CHIPS = 3;

const MonthChip = ({ group }: { group: Item[] }) => (
  <GroupButton group={group} className="truncate px-1">
    {format(group[0].scheduledAt, "h:mmaaa")} {deviceLabel(group)}
  </GroupButton>
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
        const groups = groupByWorkOrder(on(day));
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
            {groups.slice(0, MAX_CHIPS).map((group) => (
              <MonthChip key={group[0].id} group={group} />
            ))}
            {groups.length > MAX_CHIPS && (
              <button
                type="button"
                className="text-left text-xs text-muted-foreground underline"
                onClick={() => onDay(day)}
              >
                +{groups.length - MAX_CHIPS} more
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
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const tick = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(tick);
  }, []);
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
                      className="pr-2 text-right text-xs text-muted-foreground"
                    >
                      {hour > 0 && format(setHours(new Date(0), hour), "h a")}
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
                        backgroundImage: `repeating-linear-gradient(to bottom, transparent 0 ${HOUR_HEIGHT - 1}px, var(--border) ${HOUR_HEIGHT - 1}px ${HOUR_HEIGHT}px)`,
                      }}
                    >
                      {isToday(day) && (
                        <div
                          aria-hidden
                          className="absolute inset-x-0 z-10 border-t-2 border-destructive before:absolute before:-top-[6px] before:-left-1 before:size-2.5 before:rounded-full before:bg-destructive"
                          style={{ top: (minutesOf(now) * HOUR_HEIGHT) / 60 }}
                        />
                      )}
                      {/* Tickets starting in the same hour share its width. */}
                      {layout(on(day)).map((block) => (
                        <TicketBlock key={block.items[0].id} block={block} />
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
