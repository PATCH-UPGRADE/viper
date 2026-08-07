"use client";

import { formatDistanceToNow } from "date-fns";
import {
  AlertTriangleIcon,
  ChevronDownIcon,
  type LucideIcon,
  RotateCcwIcon,
  ServerIcon,
  SquareCheckIcon,
} from "lucide-react";
import Link from "next/link";
import { type ReactNode, useState } from "react";
import { PriorityBadge } from "@/components/priority-badge";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { statusLabels } from "@/features/tracking/components/ticket-detail/shared";
import { cn, plural } from "@/lib/utils";
import { useSuspenseRecentUpdates } from "../hooks/use-overview";

type RecentUpdates = ReturnType<typeof useSuspenseRecentUpdates>["data"];

type ChipKey = "advisories" | "recalls" | "workOrders" | "newAssets";

const RowDot = ({ className }: { className: string }) => (
  <span
    aria-hidden="true"
    className={cn("mt-1.5 size-1.5 shrink-0 rounded-full", className)}
  />
);

const NotificationRows = ({
  items,
}: {
  items: RecentUpdates["advisories"]["items"];
}) => (
  <>
    {items.map((item) => (
      <Link
        key={item.id}
        href={`/inbox/${item.id}`}
        prefetch
        className="flex items-start gap-2.5 rounded-md px-1 py-2 transition-colors hover:bg-accent/50"
      >
        <RowDot className="bg-red-500" />
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <p className="text-sm font-semibold">
            {item.title ?? item.summary ?? "—"}
          </p>
          <p className="text-xs text-muted-foreground">
            {item.assetCount} {plural("asset", item.assetCount)}
          </p>
        </div>
        <PriorityBadge priority={item.priority} className="shrink-0" />
      </Link>
    ))}
  </>
);

const WorkOrderRows = ({
  items,
}: {
  items: RecentUpdates["workOrders"]["items"];
}) => (
  <>
    {items.map((item) => (
      <Link
        key={item.id}
        href={`/tracking/${item.id}`}
        prefetch
        className="flex items-start gap-2.5 rounded-md px-1 py-2 transition-colors hover:bg-accent/50"
      >
        <RowDot className="bg-blue-500" />
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <p className="text-sm font-semibold">{item.summary}</p>
          <p className="text-xs text-muted-foreground">
            {formatDistanceToNow(item.changedAt, { addSuffix: true })}
            {item.from && item.to && (
              <>
                {" · "}
                {statusLabels[item.from]}
                <span className="sr-only"> changed to </span>
                <span aria-hidden="true"> → </span>
                {statusLabels[item.to]}
              </>
            )}
          </p>
        </div>
      </Link>
    ))}
  </>
);

const AssetRows = ({
  items,
}: {
  items: RecentUpdates["newAssets"]["items"];
}) => (
  <>
    {items.map((item) => (
      <div key={item.key} className="flex items-start gap-2.5 px-1 py-2">
        <RowDot className="bg-muted-foreground" />
        <div className="flex min-w-0 flex-col gap-0.5">
          <p className="text-sm font-semibold">
            {item.count}× {item.label}
          </p>
          {item.source && (
            <p className="text-xs text-muted-foreground">
              Added via {item.source}
            </p>
          )}
        </div>
      </div>
    ))}
  </>
);

const CHIPS: {
  key: ChipKey;
  icon: LucideIcon;
  /** Singular; `plural()` pluralises it, so keep the noun last. */
  label: string;
  className: string;
  /** Rows for this chip's panel — keeps the dispatch out of the render. */
  render: (data: RecentUpdates) => ReactNode;
}[] = [
  {
    key: "advisories",
    icon: AlertTriangleIcon,
    label: "new advisory",
    className: "text-red-600 dark:text-red-400",
    render: (data) => <NotificationRows items={data.advisories.items} />,
  },
  {
    key: "recalls",
    icon: RotateCcwIcon,
    label: "vendor recall",
    className: "text-orange-600 dark:text-orange-400",
    render: (data) => <NotificationRows items={data.recalls.items} />,
  },
  {
    key: "workOrders",
    icon: SquareCheckIcon,
    label: "updated work order",
    className: "text-blue-600 dark:text-blue-400",
    render: (data) => <WorkOrderRows items={data.workOrders.items} />,
  },
  {
    key: "newAssets",
    icon: ServerIcon,
    label: "new asset",
    className: "text-muted-foreground",
    render: (data) => <AssetRows items={data.newAssets.items} />,
  },
];

export const RecentUpdatesCard = () => {
  const { data } = useSuspenseRecentUpdates();
  const [openChip, setOpenChip] = useState<ChipKey | null>(null);

  // A chip with nothing behind it is noise, so only non-empty ones render.
  const visible = CHIPS.filter((chip) => data[chip.key].count > 0);
  const open = visible.find((chip) => chip.key === openChip);

  return (
    <Card className="gap-0 py-0 shadow-none">
      <div className="flex items-start justify-between gap-4 p-5">
        <div className="flex flex-col gap-0.5">
          <h2 className="text-base font-semibold leading-none">
            Updates in the last day
          </h2>
          <p className="text-sm text-muted-foreground">
            {data.totalCount === 0
              ? "No updates"
              : `${data.totalCount} ${plural("update", data.totalCount)}`}
          </p>
        </div>
        {data.totalCount > 0 && (
          <Badge className="shrink-0 gap-1.5 bg-orange-100 text-orange-700 dark:bg-orange-950/40 dark:text-orange-300">
            <span className="size-1.5 rounded-full bg-current" />
            New
          </Badge>
        )}
      </div>

      {visible.length > 0 && (
        <div className="flex flex-wrap gap-2 px-5 pb-5">
          {visible.map((chip) => {
            const { count } = data[chip.key];
            const isOpen = chip.key === openChip;
            return (
              <button
                key={chip.key}
                type="button"
                aria-expanded={isOpen}
                onClick={() => setOpenChip(isOpen ? null : chip.key)}
                className={cn(
                  "flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-sm transition-colors",
                  isOpen
                    ? "border-primary/30 bg-primary/10"
                    : "hover:bg-accent/50",
                )}
              >
                <chip.icon
                  className={cn("size-4 shrink-0", chip.className)}
                  aria-hidden="true"
                />
                <span className={cn("font-semibold", chip.className)}>
                  {count}
                </span>
                <span className="text-muted-foreground">
                  {plural(chip.label, count)}
                </span>
                <ChevronDownIcon
                  className={cn(
                    "size-4 shrink-0 text-muted-foreground transition-transform",
                    isOpen && "rotate-180",
                  )}
                  aria-hidden="true"
                />
              </button>
            );
          })}
        </div>
      )}

      {open && (
        <div className="flex flex-col border-t px-4 py-2">
          {open.render(data)}
          {data[open.key].truncated && (
            <p className="px-1 py-2 text-xs text-muted-foreground">
              Showing the first {data[open.key].items.length}
            </p>
          )}
        </div>
      )}
    </Card>
  );
};
