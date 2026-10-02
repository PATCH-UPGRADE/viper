import {
  addDays,
  addMonths,
  addWeeks,
  eachDayOfInterval,
  endOfDay,
  endOfMonth,
  endOfWeek,
  format,
  isValid,
  parse,
  startOfDay,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import type { InterruptionMode } from "./params";

// Everything here runs in the local timezone, and weeks start on Sunday
// (the date-fns default).

const DATE_PARAM_FORMAT = "yyyy-MM-dd";

export const toDateParam = (date: Date) => format(date, DATE_PARAM_FORMAT);

/** The `date` URL param as a local start-of-day; empty or invalid means today. */
export const parseAnchor = (param: string, today = new Date()): Date => {
  const parsed = parse(param, DATE_PARAM_FORMAT, today);
  return startOfDay(isValid(parsed) ? parsed : today);
};

// A month grid is at most six weeks (42 days); the server rejects longer ranges.
export const MAX_RANGE_DAYS = 43;

/**
 * Every day the calendar draws. The month range runs out to whole weeks, so
 * the leading and trailing days of the grid show their tickets too.
 */
export const visibleRange = (anchor: Date, mode: InterruptionMode) => {
  switch (mode) {
    case "day":
      return { start: startOfDay(anchor), end: endOfDay(anchor) };
    case "week":
      return { start: startOfWeek(anchor), end: endOfWeek(anchor) };
    case "month":
      return {
        start: startOfWeek(startOfMonth(anchor)),
        end: endOfWeek(endOfMonth(anchor)),
      };
  }
};

export const visibleDays = (anchor: Date, mode: InterruptionMode): Date[] =>
  eachDayOfInterval(visibleRange(anchor, mode));

const shifters = { day: addDays, week: addWeeks, month: addMonths };

export const shiftAnchor = (
  anchor: Date,
  mode: InterruptionMode,
  direction: 1 | -1,
): Date => shifters[mode](anchor, direction);

export const rangeLabel = (anchor: Date, mode: InterruptionMode): string => {
  const { start, end } = visibleRange(anchor, mode);
  switch (mode) {
    case "day":
      return format(anchor, "EEEE, MMM d, yyyy");
    case "week":
      return `${format(start, "MMM d")} – ${format(end, "MMM d, yyyy")}`;
    case "month":
      return format(anchor, "MMMM yyyy");
  }
};

/** Groups items by local day (keyed `yyyy-MM-dd`), each day sorted by time. */
export const bucketByDay = <T extends { scheduledAt: Date }>(
  items: T[],
): Map<string, T[]> => {
  const buckets = new Map<string, T[]>();
  for (const item of items) {
    const key = toDateParam(item.scheduledAt);
    const bucket = buckets.get(key);
    if (bucket) bucket.push(item);
    else buckets.set(key, [item]);
  }
  for (const bucket of buckets.values()) {
    bucket.sort((a, b) => a.scheduledAt.getTime() - b.scheduledAt.getTime());
  }
  return buckets;
};

// Only the fallback for tickets with no duration estimate; a ticket with one is
// drawn at its own length.
const FALLBACK_BLOCK_MINUTES = 60;

// Shortest block drawn, so a very short estimate still has room for its name,
// time and status.
const MIN_BLOCK_MINUTES = 45;

/** Minutes a ticket's block covers in the day and week grid. */
export const blockMinutes = (durationEstimate: number | null): number =>
  Math.max(durationEstimate ?? FALLBACK_BLOCK_MINUTES, MIN_BLOCK_MINUTES);
