import { addMinutes, format } from "date-fns";

const clock = (date: Date) =>
  date.getMinutes() === 0 ? format(date, "h a") : format(date, "h:mm a");

/** "1 PM – 1:45 PM" when the length is known, "1 PM" when it isn't. */
export const formatTimeRange = (start: Date, minutes: number | null): string =>
  minutes === null
    ? clock(start)
    : `${clock(start)} – ${clock(addMinutes(start, minutes))}`;
