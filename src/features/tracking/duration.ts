import { addMinutes, format } from "date-fns";

/** "45 min", "2 h", "2 h 30 min"; "No estimate" when there is none. */
export const formatDuration = (minutes: number | null): string => {
  if (minutes === null) return "No estimate";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
};

const clock = (date: Date) =>
  date.getMinutes() === 0 ? format(date, "h a") : format(date, "h:mm a");

/** "1 PM – 1:45 PM" when the length is known, "1 PM" when it isn't. */
export const formatTimeRange = (start: Date, minutes: number | null): string =>
  minutes === null
    ? clock(start)
    : `${clock(start)} – ${clock(addMinutes(start, minutes))}`;
