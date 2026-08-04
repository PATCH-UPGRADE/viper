"use client";

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

const EM_DASH = "—";

/**
 * Renders a value clamped to two lines. On hover/focus, a tooltip shows the full
 * value. Empty values (or the em-dash placeholder) render as a muted dash with
 * no tooltip. Handy for table cells with long free-text.
 */
export const ClampedCell = ({
  text,
  maxWidthClass = "max-w-[10rem]",
}: {
  text: string | null | undefined;
  maxWidthClass?: string;
}) => {
  const value = text?.trim();
  if (!value || value === EM_DASH) {
    return <span className="text-muted-foreground">{EM_DASH}</span>;
  }
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div
          className={cn(
            "line-clamp-2 cursor-default whitespace-normal",
            maxWidthClass,
          )}
        >
          {value}
        </div>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs whitespace-pre-wrap">
        {value}
      </TooltipContent>
    </Tooltip>
  );
};
