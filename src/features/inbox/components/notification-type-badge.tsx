import type { NotificationType } from "@/generated/prisma";
import { cn } from "@/lib/utils";

const typeConfig: Record<
  NotificationType,
  { label: string; className: string }
> = {
  Advisory: {
    label: "Advisory",
    className: "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300",
  },
  Recall: {
    label: "Recall",
    className:
      "bg-orange-100 text-orange-700 dark:bg-orange-950/40 dark:text-orange-300",
  },
  UpdateAvailable: {
    label: "New Update",
    className:
      "bg-blue-100 text-blue-600 dark:bg-blue-950/40 dark:text-blue-300",
  },
  Other: {
    label: "Other",
    className:
      "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400",
  },
};

export const NotificationTypeBadge = ({ type }: { type: NotificationType }) => {
  const config = typeConfig[type];
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md px-2 py-0.5 text-xs font-bold",
        config.className,
      )}
    >
      {config.label}
    </span>
  );
};
