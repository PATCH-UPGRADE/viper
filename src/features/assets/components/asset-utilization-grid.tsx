"use client";

import { HeatMapGrid } from "@/components/heatmap-grid";
import { Skeleton } from "@/components/ui/skeleton";
import { useAssetUtilization } from "../hooks/use-assets";
import type { UtilizationGridsResult } from "../server/utilization";
import { assetUtilizationSchema } from "../types";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;
const DAY_NAMES = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
] as const;

const HOURS_TICKS: Record<number, string | null> = {
  0: "12a",
  6: "6a",
  12: "12p",
  18: "6p",
};

type UtilizationLevel = "in-use" | "light" | "idle";

function utilizationLevel(value: number): UtilizationLevel {
  if (value <= 0) return "idle";
  if (value <= 50) return "light";
  return "in-use";
}

const LEVEL_CLASS: Record<UtilizationLevel, string> = {
  "in-use": "bg-green-600 dark:bg-green-500",
  light: "bg-green-300 dark:bg-green-800",
  idle: "bg-neutral-200 dark:bg-neutral-700",
};

const LEVEL_LABEL: Record<UtilizationLevel, string> = {
  "in-use": "In use",
  light: "Light use",
  idle: "Idle",
};

export function AssetUtilizationHeatMapGrid({
  utilization,
}: {
  utilization: unknown;
}) {
  const parsed = assetUtilizationSchema.safeParse(utilization);

  if (!parsed.success) {
    return (
      <p className="text-sm text-muted-foreground">
        No device utilization data found
      </p>
    );
  }

  const data = parsed.data;

  return (
    <HeatMapGrid
      x={{
        count: 24,
        label: (hour) => HOURS_TICKS[hour] ?? null,
        name: (hour) => `${hour}:00`,
      }}
      y={{
        count: DAYS.length,
        label: (day) => DAYS[day],
        name: (day) => DAY_NAMES[day],
      }}
      getValue={(hour, day) => data[day]?.[String(hour)] ?? 0}
      getCellClass={(value) => LEVEL_CLASS[utilizationLevel(value)]}
      getTooltip={({ x: hour, yName, value }) =>
        `${yName} ${hour}:00-${hour + 1}:00 · ${value}%`
      }
      getAriaLabel={({ x: hour, yName, value }) =>
        `${yName} ${hour}:00 to ${hour + 1}:00, ${value}% utilization, ${LEVEL_LABEL[utilizationLevel(value)]}`
      }
    />
  );
}

export function UtilizationLegend() {
  return (
    <div className="flex items-center gap-4 pt-1 text-xs text-muted-foreground">
      {(["in-use", "light", "idle"] as const).map((level) => (
        <span key={level} className="flex items-center gap-1.5">
          <span className={`size-2.5 rounded-sm ${LEVEL_CLASS[level]}`} />
          {LEVEL_LABEL[level]}
        </span>
      ))}
    </div>
  );
}

export function UtilizationGridList({
  data,
  isPending,
  isError,
}: {
  data: UtilizationGridsResult | undefined;
  isPending: boolean;
  isError: boolean;
}) {
  const assetsWithUtilization = data?.assets.filter(
    (asset) => assetUtilizationSchema.safeParse(asset.utilization).success,
  );

  if (isPending) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-28 w-full" />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <p className="text-sm text-muted-foreground">
        could not load device utilization
      </p>
    );
  }

  if (assetsWithUtilization && assetsWithUtilization.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No utilization data found for this record.
      </p>
    );
  }

  return (
    <div className="space-y-5">
      {assetsWithUtilization &&
        assetsWithUtilization.map((asset) => (
          <div key={asset.id} className="space-y-1.5">
            <p className="text-sm font-semibold">
              {asset.label}
              {asset.hostname && (
                <span className="ml-2 font-normal text-muted-foreground">
                  {asset.hostname}
                </span>
              )}
            </p>
            <AssetUtilizationHeatMapGrid utilization={asset.utilization} />
          </div>
        ))}
      <UtilizationLegend />
    </div>
  );
}

export function AssetUtilizationAnswer({ assetIds }: { assetIds: string[] }) {
  return <UtilizationGridList {...useAssetUtilization(assetIds)} />;
}
