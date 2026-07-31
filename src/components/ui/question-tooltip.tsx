import { CircleQuestionMark } from "lucide-react";
import type { PropsWithChildren } from "react";
import { cn } from "@/lib/utils";
import { Button } from "./button";
import { Tooltip, TooltipContent, TooltipTrigger } from "./tooltip";

export function QuestionTooltip({
  className,
  children,
  onClick,
  accessibleLabel = "More information",
}: PropsWithChildren<{
  className?: string;
  onClick?: () => void;
  accessibleLabel?: string;
}>) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          className={cn(onClick ? "cursor-pointer" : "cursor-help", className)}
          aria-label={accessibleLabel}
          onClick={onClick}
        >
          <CircleQuestionMark />
        </Button>
      </TooltipTrigger>
      <TooltipContent className="pr-1.5 max-w-xs">{children}</TooltipContent>
    </Tooltip>
  );
}
