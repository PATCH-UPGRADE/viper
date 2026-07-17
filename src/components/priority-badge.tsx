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
    className: "bg-red-600 text-white dark:bg-red-600",
  },
  High: {
    label: "High",
    className: "bg-orange-600 text-white dark:bg-orange-600",
  },
  Monitor: {
    label: "Monitor",
    className: "bg-yellow-500 text-black dark:bg-yellow-500 dark:text-black",
  },
  Defer: {
    label: "Defer",
    className: "bg-blue-600 text-white dark:bg-blue-600",
  },
  Unsorted: {
    label: "Unassigned",
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
