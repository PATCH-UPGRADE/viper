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
import {
  CalendarDaysIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
} from "lucide-react";
import { parseAsString, parseAsStringLiteral, useQueryState } from "nuqs";
import { useEffect, useRef } from "react";
import { ErrorView, LoadingView } from "@/components/entity-components";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { cn } from "@/lib/utils";
import { useTRPC } from "@/trpc/client";
import { formatTimeRange } from "../../duration";
import { statusLabels } from "../ticket-detail/shared";
import { type DrawerTicket, TicketDrawer } from "./ticket-drawer";

const DATE_FORMAT = "yyyy-MM-dd";
const MODES = ["day", "week", "month"] as const;
type Mode = (typeof MODES)[number];

const HOUR_HEIGHT = 72;
const HOURS = Array.from({ length: 24 }, (_, h) => h);
// Block heights in minutes: never shorter than MIN_BLOCK, FALLBACK_BLOCK with
// no estimate.
const MIN_BLOCK = 45;
const FALLBACK_BLOCK = 60;

type Item = DrawerTicket & { durationEstimate: number | null };

const emptyStates = {
  "no-department": {
    title: "You're not assigned to a department",
    description:
      "Maintenance is shown by department. Ask an administrator to add you to one.",
  },
  "no-assets": {
    title: "Your department doesn't manage any devices yet",
    description:
      "Once devices are assigned to your department, their maintenance appears here.",
  },
};

const step = { day: addDays, week: addWeeks, month: addMonths };

const rangeOf = (anchor: Date, mode: Mode) =>
  mode === "day"
    ? { start: startOfDay(anchor), end: endOfDay(anchor) }
    : mode === "week"
      ? { start: startOfWeek(anchor), end: endOfWeek(anchor) }
      : {
          start: startOfWeek(startOfMonth(anchor)),
          end: endOfWeek(endOfMonth(anchor)),
        };

// One ticket: a block in the time grid, or a single line in a month cell, and
// the button that opens its drawer. Status is spelled out, never colour alone.
const Entry = ({ item, compact }: { item: Item; compact?: boolean }) => (
  <TicketDrawer ticket={item}>
    <button
      type="button"
      title={item.summary}
      className={cn(
        "flex w-full flex-col gap-0.5 overflow-hidden rounded-md border bg-card px-1.5 py-0.5 text-left text-[11px] leading-tight shadow-xs hover:bg-accent",
        !compact && "h-full border-l-4 border-l-primary/70",
      )}
    >
      <span className="truncate text-xs font-medium">{item.assetName}</span>
      <span className="truncate text-muted-foreground">
        {compact
          ? format(item.scheduledAt, "h:mm a")
          : formatTimeRange(item.scheduledAt, item.durationEstimate)}
        {!compact && item.durationEstimate === null && " · No estimate"}
      </span>
      {!compact && (
        <span className="truncate text-muted-foreground">
          {statusLabels[item.status]}
        </span>
      )}
    </button>
  </TicketDrawer>
);

const TimeGrid = ({ days, items }: { days: Date[]; items: Item[] }) => {
  const scroller = useRef<HTMLDivElement>(null);
  // Open at the working day, not midnight.
  useEffect(() => {
    if (scroller.current) scroller.current.scrollTop = 7 * HOUR_HEIGHT;
  }, []);

  return (
    <div ref={scroller} className="min-h-0 flex-1 overflow-auto">
      <div className="sticky top-0 z-10 flex bg-background">
        <div className="w-14 shrink-0 border-b" />
        {days.map((day) => (
          <div
            key={day.toISOString()}
            className="flex min-w-36 flex-1 items-center gap-1.5 border-b border-l px-2 py-1.5 text-sm"
          >
            <span className="text-muted-foreground">{format(day, "EEE")}</span>
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
        ))}
      </div>
      <div className="flex">
        <div aria-hidden className="w-14 shrink-0">
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
            {items
              .filter((item) => isSameDay(item.scheduledAt, day))
              .map((item) => {
                const start =
                  item.scheduledAt.getHours() * 60 +
                  item.scheduledAt.getMinutes();
                const minutes = Math.min(
                  Math.max(item.durationEstimate ?? FALLBACK_BLOCK, MIN_BLOCK),
                  24 * 60 - start,
                );
                return (
                  <div
                    key={item.id}
                    className="absolute inset-x-0.5"
                    style={{
                      top: (start * HOUR_HEIGHT) / 60,
                      height: (minutes * HOUR_HEIGHT) / 60 - 2,
                    }}
                  >
                    <Entry item={item} />
                  </div>
                );
              })}
          </section>
        ))}
      </div>
    </div>
  );
};

const MonthGrid = ({
  days,
  anchor,
  items,
}: {
  days: Date[];
  anchor: Date;
  items: Item[];
}) => (
  <div className="grid min-h-0 flex-1 auto-rows-fr grid-cols-7 overflow-auto">
    {days.map((day) => (
      <section
        key={day.toISOString()}
        aria-label={format(day, "EEEE, MMMM d")}
        className={cn(
          "flex min-h-28 min-w-0 flex-col gap-0.5 border-b border-l p-1",
          !isSameMonth(day, anchor) && "bg-muted/40",
        )}
      >
        <span
          className={cn(
            "w-fit px-1 text-xs text-muted-foreground",
            isToday(day) &&
              "rounded-full bg-primary font-bold text-primary-foreground",
          )}
        >
          {format(day, "d")}
          {isToday(day) && <span className="sr-only"> (today)</span>}
        </span>
        {items
          .filter((item) => isSameDay(item.scheduledAt, day))
          .map((item) => (
            <Entry key={item.id} item={item} compact />
          ))}
      </section>
    ))}
  </div>
);

export const InterruptionsCalendar = () => {
  // No date means today; no mode means week.
  const [date, setDate] = useQueryState("date", parseAsString);
  const [mode, setMode] = useQueryState(
    "mode",
    parseAsStringLiteral(MODES)
      .withDefault("week")
      .withOptions({ clearOnDefault: true }),
  );
  const trpc = useTRPC();

  const parsed = parse(date ?? "", DATE_FORMAT, new Date());
  const anchor = startOfDay(isValid(parsed) ? parsed : new Date());
  const { start, end } = rangeOf(anchor, mode);
  const { data, isError } = useQuery(
    trpc.tracking.getInterruptionCalendar.queryOptions({
      from: start,
      to: end,
    }),
  );
  const go = (day: Date) => setDate(format(day, DATE_FORMAT));
  const days = eachDayOfInterval({ start, end });
  const label =
    mode === "day"
      ? format(anchor, "EEEE, MMM d, yyyy")
      : mode === "month"
        ? format(anchor, "MMMM yyyy")
        : `${format(start, "MMM d")} – ${format(end, "MMM d, yyyy")}`;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 px-4 pt-3 pb-4">
      <header className="flex items-baseline gap-3">
        <h1 className="text-sm font-semibold">Device Maintenance</h1>
        <p className="hidden truncate text-sm text-muted-foreground lg:block">
          Open work orders for devices in your departments, as recorded in
          VIPER.
        </p>
      </header>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <Tabs value="calendar">
          <TabsList variant="line">
            <TabsTrigger value="calendar">
              <CalendarDaysIcon aria-hidden />
              Calendar
              {data && (
                <Badge variant="secondary" className="px-1.5 py-0 text-xs">
                  {data.items.length}
                </Badge>
              )}
            </TabsTrigger>
          </TabsList>
        </Tabs>
        <nav
          aria-label="Calendar navigation"
          className="ml-auto flex items-center gap-1"
        >
          <Button variant="outline" onClick={() => setDate(null)}>
            Today
          </Button>
          <Button
            variant="outline"
            size="icon"
            aria-label={`Previous ${mode}`}
            onClick={() => go(step[mode](anchor, -1))}
          >
            <ChevronLeftIcon aria-hidden />
          </Button>
          <Button
            variant="outline"
            size="icon"
            aria-label={`Next ${mode}`}
            onClick={() => go(step[mode](anchor, 1))}
          >
            <ChevronRightIcon aria-hidden />
          </Button>
          <span aria-live="polite" className="ml-2 text-sm font-medium">
            {label}
          </span>
        </nav>
        <ToggleGroup
          type="single"
          variant="outline"
          value={mode}
          onValueChange={(next) => next && setMode(next as Mode)}
          aria-label="Calendar range"
        >
          {MODES.map((value) => (
            <ToggleGroupItem
              key={value}
              value={value}
              className="px-3 capitalize"
            >
              {value}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>

      {isError ? (
        <ErrorView message="Error loading maintenance" />
      ) : !data ? (
        <LoadingView message="Loading maintenance..." />
      ) : data.scope !== "ready" ? (
        <Empty className="border border-dashed">
          <EmptyHeader>
            <EmptyTitle>{emptyStates[data.scope].title}</EmptyTitle>
            <EmptyDescription>
              {emptyStates[data.scope].description}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border bg-card">
          {mode === "month" ? (
            <MonthGrid days={days} anchor={anchor} items={data.items} />
          ) : (
            <TimeGrid days={days} items={data.items} />
          )}
        </div>
      )}
    </div>
  );
};
