"use client";

import type React from "react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

/**
 * Compact rounded label pill with an optional trailing count badge.
 * The label content (children) truncates; pass `count` to render the
 * circular secondary badge on the right.
 */
export function Pill({
  children,
  count,
  className,
  ...props
}: { count?: React.ReactNode } & React.ComponentProps<"span">) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border bg-muted px-2 py-0.5 text-xs",
        className,
      )}
      {...props}
    >
      <span className="truncate max-w-[120px]">{children}</span>
      {count !== undefined && (
        <Badge
          variant="secondary"
          className="size-4 rounded-full p-0 text-[10px] flex items-center justify-center shrink-0"
        >
          {count}
        </Badge>
      )}
    </span>
  );
}
