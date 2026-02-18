import { CircleQuestionMark } from "lucide-react";
import type { PropsWithChildren } from "react";
import { cn } from "@/lib/utils";
import { Button } from "./button";
import { Tooltip, TooltipContent, TooltipTrigger } from "./tooltip";

export function QuestionTooltip({
  className,
  children,
}: PropsWithChildren<{ className?: string }>) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          className={cn(className, "cursor-help")}
          aria-label="More information"
        >
          <CircleQuestionMark />
        </Button>
      </TooltipTrigger>
      <TooltipContent className="pr-1.5">{children}</TooltipContent>
    </Tooltip>
  );
}
