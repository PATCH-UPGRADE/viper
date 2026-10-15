import { CalendarSyncIcon } from "lucide-react";

// Marks an event or row with a reschedule request waiting for a decision.
export const PendingRescheduleIcon = () => (
  <CalendarSyncIcon
    className="size-3 shrink-0"
    role="img"
    aria-label="Reschedule requested"
  />
);
