import { format } from "date-fns";

// `separator` sits between the date and the time (e.g. "Jul 21, 2026 at 3:00
// PM" vs "· 3:00 PM"); it is a date-fns literal, so it is not interpreted.
export const formatScheduled = (
  date: Date | string | null | undefined,
  separator = "at",
) => {
  if (!date) return null;
  const d = date instanceof Date ? date : new Date(date);
  return format(d, `MMM d, yyyy '${separator}' h:mm a`);
};

/** Three-letter English month abbreviations, indexed 0 = Jan … 11 = Dec. */
export const MONTHS_SHORT = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

export const DAYS_SHORT = [
  "Mon",
  "Tue",
  "Wed",
  "Thu",
  "Fri",
  "Sat",
  "Sun",
] as const;

export const DAY_NAMES_SHORT = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
] as const;
