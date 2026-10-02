"use client";

import {
  CalendarDaysIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  MaximizeIcon,
  MinimizeIcon,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useFullscreen } from "../../hooks/use-fullscreen";
import { useInterruptionCalendar } from "../../hooks/use-interruptions";
import { useInterruptionsParams } from "../../hooks/use-interruptions-params";
import {
  parseAnchor,
  rangeLabel,
  shiftAnchor,
  toDateParam,
  visibleRange,
} from "../../interruptions-dates";
import { INTERRUPTION_MODES, type InterruptionMode } from "../../params";

// Counts are device tickets only: those in the calendar's visible range.
const Count = ({ n }: { n: number | undefined }) =>
  n === undefined ? null : (
    <Badge variant="secondary" className="px-1.5 py-0 text-xs">
      {n}
    </Badge>
  );

export const InterruptionsHeader = () => {
  const [{ mode, date }, setParams] = useInterruptionsParams();
  const { isFullscreen, toggle } = useFullscreen();
  const anchor = parseAnchor(date);
  const { start, end } = visibleRange(anchor, mode);
  const calendar = useInterruptionCalendar({ from: start, to: end });
  const go = (next: Date) => setParams({ date: toDateParam(next) });

  return (
    <header className="flex flex-col gap-3 px-4 pt-3">
      <div className="flex items-center gap-3">
        <h1 className="text-sm font-semibold">Device Maintenance</h1>
        <Button
          className="ml-auto"
          variant="ghost"
          size="icon"
          aria-pressed={isFullscreen}
          aria-label={isFullscreen ? "Exit full screen" : "Enter full screen"}
          onClick={toggle}
        >
          {isFullscreen ? (
            <MinimizeIcon aria-hidden />
          ) : (
            <MaximizeIcon aria-hidden />
          )}
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <Tabs value="calendar">
          <TabsList variant="line">
            <TabsTrigger value="calendar">
              <CalendarDaysIcon aria-hidden />
              Calendar
              <Count n={calendar.data?.assetTicketCount} />
            </TabsTrigger>
          </TabsList>
        </Tabs>

        <nav
          aria-label="Calendar navigation"
          className="ml-auto flex items-center gap-1"
        >
          <Button variant="outline" onClick={() => setParams({ date: "" })}>
            Today
          </Button>
          <Button
            variant="outline"
            size="icon"
            aria-label={`Previous ${mode}`}
            onClick={() => go(shiftAnchor(anchor, mode, -1))}
          >
            <ChevronLeftIcon aria-hidden />
          </Button>
          <Button
            variant="outline"
            size="icon"
            aria-label={`Next ${mode}`}
            onClick={() => go(shiftAnchor(anchor, mode, 1))}
          >
            <ChevronRightIcon aria-hidden />
          </Button>
          <span aria-live="polite" className="ml-2 text-sm font-medium">
            {rangeLabel(anchor, mode)}
          </span>
        </nav>
        <ToggleGroup
          type="single"
          variant="outline"
          value={mode}
          onValueChange={(next) =>
            next && setParams({ mode: next as InterruptionMode })
          }
          aria-label="Calendar range"
        >
          {INTERRUPTION_MODES.map((value) => (
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
    </header>
  );
};
