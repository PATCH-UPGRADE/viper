"use client";

import { useQuery } from "@tanstack/react-query";
import {
  addWeeks,
  eachDayOfInterval,
  endOfWeek,
  format,
  isSameDay,
  isValid,
  parse,
  startOfDay,
  startOfWeek,
} from "date-fns";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { parseAsString, useQueryState } from "nuqs";
import { ErrorView, LoadingView } from "@/components/entity-components";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";
import { useTRPC } from "@/trpc/client";
import { StatusChip } from "../ticket-detail/shared";

const DATE_FORMAT = "yyyy-MM-dd";

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

export const InterruptionsCalendar = () => {
  // yyyy-MM-dd; empty (the default, so it stays out of the URL) means today.
  const [date, setDate] = useQueryState(
    "date",
    parseAsString.withDefault("").withOptions({ clearOnDefault: true }),
  );
  const trpc = useTRPC();

  const parsed = parse(date, DATE_FORMAT, new Date());
  const anchor = startOfDay(isValid(parsed) ? parsed : new Date());
  const from = startOfWeek(anchor);
  const to = endOfWeek(anchor);
  const { data, isError } = useQuery(
    trpc.tracking.getInterruptionCalendar.queryOptions({ from, to }),
  );
  const go = (day: Date) => setDate(format(day, DATE_FORMAT));

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-auto p-4">
      <header className="flex flex-wrap items-center gap-3">
        <h1 className="text-lg font-semibold">Device Maintenance</h1>
        <nav
          aria-label="Week navigation"
          className="ml-auto flex items-center gap-2"
        >
          <Button variant="outline" onClick={() => setDate(null)}>
            Today
          </Button>
          <Button
            variant="outline"
            size="icon"
            aria-label="Previous week"
            onClick={() => go(addWeeks(anchor, -1))}
          >
            <ChevronLeftIcon aria-hidden />
          </Button>
          <Button
            variant="outline"
            size="icon"
            aria-label="Next week"
            onClick={() => go(addWeeks(anchor, 1))}
          >
            <ChevronRightIcon aria-hidden />
          </Button>
          <span aria-live="polite" className="text-sm font-medium">
            {format(from, "MMM d")} – {format(to, "MMM d, yyyy")}
          </span>
        </nav>
      </header>

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
        <div className="grid grid-cols-7 gap-2">
          {eachDayOfInterval({ start: from, end: to }).map((day) => (
            <section
              key={day.toISOString()}
              aria-label={format(day, "EEEE, MMMM d")}
              className="flex min-h-48 flex-col gap-2 rounded-lg border p-2"
            >
              <h2 className="text-sm font-semibold">{format(day, "EEE d")}</h2>
              <ul className="flex flex-col gap-2">
                {data.items
                  .filter((item) => isSameDay(item.scheduledAt, day))
                  .map((item) => (
                    <li
                      key={item.id}
                      title={item.summary}
                      className="flex flex-col gap-1 rounded-md border bg-card p-2 text-xs"
                    >
                      <span className="font-medium">{item.assetName}</span>
                      <span className="text-muted-foreground">
                        {format(item.scheduledAt, "h:mm a")}
                      </span>
                      <StatusChip status={item.status} className="w-fit" />
                    </li>
                  ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
};
