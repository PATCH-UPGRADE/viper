"use client";

import { useQuery } from "@tanstack/react-query";
import {
  addDays,
  addMinutes,
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
  CalendarIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CircleHelpIcon,
  ListIcon,
} from "lucide-react";
import { parseAsString, parseAsStringLiteral, useQueryState } from "nuqs";
import { type ReactNode, useEffect, useState } from "react";
import { ErrorView, LoadingView } from "@/components/entity-components";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { MaintenanceAvailability } from "@/generated/prisma";
import { cn } from "@/lib/utils";
import { useTRPC } from "@/trpc/client";
import {
  availabilityLabels,
  availabilityStyle,
  UnreadDot,
} from "../ticket-detail/shared";
import { InterruptionsList } from "./interruptions-list";
import { type DrawerTicket, TicketDrawer } from "./ticket-drawer";

const DATE_FORMAT = "yyyy-MM-dd";
const HOUR_HEIGHT = 72;
const HOURS = Array.from({ length: 24 }, (_, hour) => hour);
// A block is this tall, in minutes, when the work order has no estimate.
const DEFAULT_MINUTES = 60;

// The calendar only holds tickets that have a time.
type Item = DrawerTicket & {
  scheduledAt: Date;
  workOrderId: string;
  unread: boolean;
};
type Block = {
  items: Item[];
  start: number;
  len: number;
  lane: number;
  lanes: number;
};

// One group per work order and time, so a fleet update reads "3 devices".
const groupByWorkOrder = (items: Item[]) => [
  ...Map.groupBy(
    items,
    (item) => `${item.workOrderId}|${item.scheduledAt.getTime()}`,
  ).values(),
];

// Blocks that overlap sit in separate lanes, sharing the day's width.
const layout = (items: Item[]): Block[] => {
  const blocks = groupByWorkOrder(items)
    .map((group) => ({
      items: group,
      start: minutesOf(group[0].scheduledAt),
      len: group[0].durationEstimate ?? DEFAULT_MINUTES,
      lane: 0,
      lanes: 1,
    }))
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

const deviceLabel = (group: Item[]) =>
  group.length > 1
    ? `${group.length} devices · ${group[0].assetName}`
    : group[0].assetName;

// The availability-colored button that opens a group's drawer.
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
  return (
    <TicketDrawer ticket={item}>
      <button
        type="button"
        title={item.summary}
        className={cn(
          "overflow-hidden rounded border border-l-4 text-left text-[11px] hover:brightness-95",
          availabilityStyle(item.availability).className,
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
  const { Icon } = availabilityStyle(item.availability);
  return (
    <div
      className="absolute"
      style={{
        left: `calc(${(block.lane * 100) / block.lanes}% + 2px)`,
        width: `calc(${100 / block.lanes}% - 4px)`,
        top: (block.start * HOUR_HEIGHT) / 60,
        height: Math.max((block.len * HOUR_HEIGHT) / 60 - 2, 20),
      }}
    >
      <GroupButton
        group={block.items}
        className="flex h-full w-full flex-col gap-0.5 rounded-md px-1.5 py-0.5 leading-tight"
      >
        <span className="flex items-center gap-1 text-xs font-medium">
          <span className="truncate">{deviceLabel(block.items)}</span>
          {block.items.some((i) => i.unread) && <UnreadDot />}
        </span>
        <span className="flex items-center gap-1">
          <Icon className="size-3 shrink-0" aria-hidden />
          <span className="truncate">
            {format(item.scheduledAt, "h:mm a")}
            {item.durationEstimate &&
              ` – ${format(addMinutes(item.scheduledAt, item.durationEstimate), "h:mm a")}`}
          </span>
        </span>
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

const Calendar = ({ lead }: { lead: ReactNode }) => {
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
    trpc.tracking.getInterruptionCalendar.queryOptions(
      { from: start, to: end },
      { refetchInterval: 60_000 },
    ),
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
    <div className="relative flex min-h-0 flex-1 flex-col gap-3 px-4 pt-3 pb-4">
      <Popover>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            size="icon"
            aria-label="Legend"
            className="absolute bottom-6 left-6 z-30 rounded-full"
          >
            <CircleHelpIcon aria-hidden />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          className="flex w-72 flex-col gap-2 text-sm"
        >
          {[
            ...(Object.keys(availabilityLabels) as MaintenanceAvailability[]),
            null,
          ].map((availability) => {
            const style = availabilityStyle(availability);
            return (
              <span
                key={availability ?? "none"}
                className="flex items-center gap-2"
              >
                <span
                  className={cn("size-4 rounded border", style.className)}
                />
                {style.label}
              </span>
            );
          })}
          <span className="flex items-center gap-2">
            <UnreadDot />
            Not opened by you
          </span>
        </PopoverContent>
      </Popover>
      <div className="flex flex-wrap items-center gap-2">
        {lead}
        <nav
          aria-label="Calendar navigation"
          className="ml-auto flex flex-wrap items-center gap-1"
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
          <Tabs value={mode} onValueChange={(v) => setMode(v as typeof mode)}>
            <TabsList>
              <TabsTrigger value="day">Day</TabsTrigger>
              <TabsTrigger value="week">Week</TabsTrigger>
              <TabsTrigger value="month">Month</TabsTrigger>
            </TabsList>
          </Tabs>
        </nav>
      </div>

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
                  <div className="sticky top-0 z-20 h-12 border-b bg-card" />
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
                    <h2 className="sticky top-0 z-20 flex h-12 items-center justify-center gap-1.5 border-b bg-card px-2 text-sm">
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
                      <span className="text-xs text-muted-foreground">
                        {on(day).length > 0 && `· ${on(day).length}`}
                      </span>
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

export const InterruptionsView = () => {
  const [tab, setTab] = useQueryState(
    "tab",
    parseAsStringLiteral(["calendar", "list"] as const).withDefault("calendar"),
  );
  const tabs = (
    <TabsList variant="line">
      <TabsTrigger value="calendar">
        <CalendarIcon aria-hidden />
        Calendar
      </TabsTrigger>
      <TabsTrigger value="list">
        <ListIcon aria-hidden />
        List
      </TabsTrigger>
    </TabsList>
  );
  return (
    <Tabs
      value={tab}
      onValueChange={(v) => setTab(v as typeof tab)}
      className="min-h-0 flex-1 gap-0"
    >
      <TabsContent value="calendar" className="flex min-h-0 flex-1 flex-col">
        <Calendar lead={tabs} />
      </TabsContent>
      <TabsContent
        value="list"
        className="flex min-h-0 flex-1 flex-col gap-3 p-4"
      >
        {tabs}
        <InterruptionsList />
      </TabsContent>
    </Tabs>
  );
};
