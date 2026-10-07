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
import {
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { ErrorView, LoadingView } from "@/components/entity-components";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { useTRPC } from "@/trpc/client";
import {
  availabilityStyle,
  endPassed,
  statusLabels,
} from "../ticket-detail/shared";
import { InterruptionsList } from "./interruptions-list";
import { type DrawerTicket, TicketDrawer } from "./ticket-drawer";

const DATE_FORMAT = "yyyy-MM-dd";
const HOUR_HEIGHT = 72;
const HOURS = Array.from({ length: 24 }, (_, hour) => hour);
const DEFAULT_MINUTES = 60;

// The calendar only holds tickets that have a time.
type Item = DrawerTicket & {
  scheduledAt: Date;
  workOrderId: string;
  unread: boolean;
};
type Block = {
  item: Item;
  start: number;
  len: number;
  lane: number;
  lanes: number;
};

// One block per event on this day. An event that runs past midnight continues
// at the top of the next day. Blocks that overlap sit in separate lanes.
const layout = (day: Date, items: Item[]) => {
  const dayMinutes = 24 * 60;
  const blocks = items
    .flatMap((item) => {
      const start = minutesOf(item.scheduledAt);
      const length = item.durationEstimate ?? DEFAULT_MINUTES;
      if (isSameDay(item.scheduledAt, day)) {
        return [{ item, start, len: Math.min(length, dayMinutes - start) }];
      }
      const spill = start + length - dayMinutes;
      return spill > 0 && isSameDay(addDays(item.scheduledAt, 1), day)
        ? [{ item, start: 0, len: spill }]
        : [];
    })
    .map((block) => ({ ...block, lane: 0 }))
    .sort((a, b) => a.start - b.start);
  const laneEnds: number[] = [];
  for (const block of blocks) {
    const free = laneEnds.findIndex((end) => end <= block.start);
    block.lane = free < 0 ? laneEnds.length : free;
    laneEnds[block.lane] = block.start + block.len;
  }
  return blocks.map((block) => ({ ...block, lanes: laneEnds.length }));
};

// The availability-colored button that opens an event's drawer.
const ItemButton = ({
  item,
  className,
  children,
}: {
  item: Item;
  className: string;
  children: ReactNode;
}) => (
  <TicketDrawer ticket={item}>
    <button
      type="button"
      title={item.summary}
      className={cn(
        "overflow-hidden rounded border text-left text-[11px] hover:brightness-95",
        availabilityStyle(item.availability).className,
        item.unread && "border-l-4 border-l-primary",
        className,
      )}
    >
      {children}
    </button>
  </TicketDrawer>
);

const chip = "rounded border bg-background/60 px-1 text-[10px]";

// Short blocks show one line, taller ones add chips, and Day view the summary.
const TicketBlock = ({ block, day }: { block: Block; day: boolean }) => {
  const { item } = block;
  const { Icon, label } = availabilityStyle(item.availability);
  const height = Math.max((block.len * HOUR_HEIGHT) / 60 - 2, 20);
  const size = height < 33 ? "xs" : height < 51 ? "sm" : "lg";
  return (
    <div
      className="absolute"
      style={{
        left: `calc(${(block.lane * 100) / block.lanes}% + 2px)`,
        width: `calc(${100 / block.lanes}% - 4px)`,
        top: (block.start * HOUR_HEIGHT) / 60,
        height,
      }}
    >
      <ItemButton
        item={item}
        className={cn(
          "flex h-full w-full flex-col gap-0.5 rounded-md px-1.5 py-0.5 leading-tight",
          !item.durationEstimate &&
            "[mask-image:linear-gradient(to_bottom,#000_55%,transparent)]",
        )}
      >
        <span className="sr-only">{label}</span>
        <span className="truncate text-xs font-medium">
          {item.assetName} • {item.summary}
          {size === "xs" && ` · ${format(item.scheduledAt, "h:mm a")}`}
        </span>
        {size !== "xs" && (
          <span className="flex items-center gap-1">
            <Icon className="size-3 shrink-0" aria-hidden />
            <span className="truncate">
              {format(item.scheduledAt, "h:mm a")}
              {item.durationEstimate &&
                ` – ${format(addMinutes(item.scheduledAt, item.durationEstimate), "h:mm a")}`}
            </span>
          </span>
        )}
        {size === "lg" && (
          <span className="flex flex-wrap gap-1">
            <span className={chip}>{statusLabels[item.status]}</span>
            {endPassed(item) && <span className={chip}>End time passed</span>}
            {item.durationEstimate && (
              <span className={chip}>{item.durationEstimate} min</span>
            )}
          </span>
        )}
        {day && size === "lg" && (
          <span className="truncate opacity-80">{item.summary}</span>
        )}
      </ItemButton>
    </div>
  );
};

const MAX_CHIPS = 3;

const MonthChip = ({ item }: { item: Item }) => {
  const { Icon } = availabilityStyle(item.availability);
  return (
    <ItemButton item={item} className="flex items-center gap-1 truncate px-1">
      <Icon className="size-3 shrink-0" aria-hidden />
      <span className="truncate">
        {format(item.scheduledAt, "h:mmaaa")} {item.assetName} • {item.summary}
      </span>
    </ItemButton>
  );
};

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
              <button type="button" onClick={() => onDay(day)}>
                {format(day, "d")}
              </button>
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
const HEADER = 48;
const px = (minutes: number) => (minutes * HOUR_HEIGHT) / 60;

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
      // A day earlier too, for an event that runs past midnight into `start`.
      { from: addDays(start, -1), to: end },
      { refetchInterval: 60_000 },
    ),
  );
  const grid = useRef<HTMLDivElement | null>(null);
  // Scroll position, to count tickets scrolled out of view. Opens at 7 AM.
  const [visible, setVisible] = useState({ top: 7 * HOUR_HEIGHT, height: 0 });
  const track = useCallback((el: HTMLDivElement | null) => {
    grid.current = el;
    if (el) el.scrollTop = 7 * HOUR_HEIGHT;
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
          <p className="font-semibold">Legend</p>
          <p className="text-xs text-muted-foreground">Availability</p>
          {(["AVAILABLE", "PARTIAL", "UNAVAILABLE", null] as const).map(
            (availability) => {
              const style = availabilityStyle(availability);
              return (
                <Badge
                  key={availability ?? "none"}
                  variant="outline"
                  className={cn("self-start", style.className)}
                >
                  <style.Icon aria-hidden />
                  {style.label}
                </Badge>
              );
            },
          )}
          <hr />
          <span className="flex items-center gap-2">
            <span className="h-4 w-6 rounded border border-l-4 border-l-primary" />
            Not opened by you
          </span>
          <span className="flex items-center gap-2">
            <span className="h-4 w-6 rounded border" />
            Duration unknown (fades out)
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
              ref={track}
              onScroll={(e) =>
                setVisible({
                  top: e.currentTarget.scrollTop,
                  height: e.currentTarget.clientHeight,
                })
              }
              className="min-h-0 flex-1 overflow-auto rounded-lg border bg-card"
            >
              <div className="flex">
                <div aria-hidden className="w-14 shrink-0">
                  <div className="sticky top-0 z-20 h-12 border-b bg-card" />
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
                {days.map((day) => {
                  const dayItems = on(day);
                  const blocks = layout(day, items ?? []);
                  const above = blocks.filter(
                    (b) => px(b.start + b.len) <= visible.top,
                  );
                  const below = blocks.filter(
                    (b) => px(b.start) >= visible.top + visible.height - HEADER,
                  );
                  const goTo = (block: Block) =>
                    grid.current?.scrollTo({
                      top: px(block.start) - HOUR_HEIGHT,
                      behavior: "smooth",
                    });
                  return (
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
                        {isToday(day) && (
                          <span className="sr-only">(today)</span>
                        )}
                        <span className="text-xs text-muted-foreground">
                          {dayItems.length > 0 && `· ${dayItems.length}`}
                        </span>
                        {above.length > 0 && (
                          <button
                            type="button"
                            title="Earlier tickets out of view"
                            className="rounded-full border border-primary px-1.5 text-xs text-primary"
                            onClick={() => goTo(above[above.length - 1])}
                          >
                            ↑ {above.length}
                          </button>
                        )}
                      </h2>
                      <div
                        className="relative"
                        style={{
                          height: HOURS.length * HOUR_HEIGHT,
                          backgroundImage: `repeating-linear-gradient(to bottom, var(--border) 0px, var(--border) 1px, transparent 1px, transparent ${HOUR_HEIGHT}px)`,
                        }}
                      >
                        {isToday(day) && <NowLine />}
                        {blocks.map((block) => (
                          <TicketBlock
                            key={`${block.item.id}-${block.start}`}
                            block={block}
                            day={mode === "day"}
                          />
                        ))}
                      </div>
                      {below.length > 0 && (
                        <div className="sticky bottom-2 z-20 flex h-0 justify-center">
                          <button
                            type="button"
                            title="Later tickets out of view"
                            className="-translate-y-full rounded-full border border-primary bg-card px-2 text-xs text-primary"
                            onClick={() => goTo(below[0])}
                          >
                            ↓ {below.length} later
                          </button>
                        </div>
                      )}
                    </section>
                  );
                })}
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
  const trpc = useTRPC();
  const { data: all } = useQuery(
    trpc.tracking.getInterruptionList.queryOptions(undefined, {
      refetchInterval: 60_000,
    }),
  );
  const tabs = (
    <TabsList variant="line">
      <TabsTrigger value="calendar">
        <CalendarIcon aria-hidden />
        Calendar
        {all && (
          <Badge variant="secondary">
            {all.filter((i) => i.scheduledAt).length}
          </Badge>
        )}
      </TabsTrigger>
      <TabsTrigger value="list">
        <ListIcon aria-hidden />
        List
        {all && (
          <Badge variant="secondary">
            {all.length}
            {all.length >= 500 && "+"}
          </Badge>
        )}
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
