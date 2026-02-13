import { cn } from "@/lib/utils";
import type { PropsWithChildren } from "react";
import { Tooltip, TooltipContent, TooltipTrigger } from "./tooltip";
import { Button } from "./button";
import { CircleQuestionMark } from "lucide-react";

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
        >
          <CircleQuestionMark />
        </Button>
      </TooltipTrigger>
      <TooltipContent className="pr-1.5">{children}</TooltipContent>
    </Tooltip>
  );
}
