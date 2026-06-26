"use client";

import type React from "react";
import type { Priority } from "@/generated/prisma";
import { cn } from "@/lib/utils";

export const priorityConfig: Record<
  Priority,
  { label: string; className: string }
> = {
  Critical: {
    label: "Critical",
    className: "bg-red-50 text-red-600 dark:bg-red-950/25 dark:text-red-400",
  },
  High: {
    label: "High",
    className:
      "bg-orange-50 text-orange-600 dark:bg-orange-950/25 dark:text-orange-400",
  },
  Monitor: {
    label: "Monitor",
    className:
      "bg-yellow-50 text-yellow-700 dark:bg-yellow-950/25 dark:text-yellow-300",
  },
  Defer: {
    label: "Defer",
    className:
      "bg-blue-50 text-blue-600 dark:bg-blue-950/25 dark:text-blue-400",
  },
  Unsorted: {
    label: "Unsorted",
    className:
      "bg-gray-50 text-gray-500 dark:bg-gray-900/40 dark:text-gray-400",
  },
};

export const PriorityBadge = ({
  priority,
  className,
  ref,
  ...props
}: { priority: Priority } & React.ComponentProps<"span">) => {
  const config = priorityConfig[priority];
  return (
    <span
      ref={ref}
      className={cn(
        "inline-flex items-center rounded-md px-2 py-0.5 text-xs font-bold",
        config.className,
        className,
      )}
      {...props}
    >
      {config.label}
    </span>
  );
};
