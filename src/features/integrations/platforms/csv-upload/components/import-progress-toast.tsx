"use client";

import { toast } from "sonner";
import { Progress } from "@/components/ui/progress";
import { plural } from "@/lib/utils";
import { formatCount } from "../review/labels";

const UNTIL_DISMISSED = Number.POSITIVE_INFINITY;
const KEEP_WORKING = "You can keep working.";

export const importToastId = (importId: string): string =>
  `csv-import-${importId}`;

const ProgressDescription = ({
  doneCount,
  totalCount,
  unit,
}: {
  doneCount: number;
  totalCount: number;
  unit: string;
}) => {
  const percentDone = Math.round((doneCount / totalCount) * 100);
  const progressLabel = `${formatCount(doneCount)} of ${formatCount(totalCount)} ${plural(unit, totalCount)}`;
  return (
    <span className="flex w-56 flex-col gap-1.5">
      <Progress
        value={percentDone}
        aria-label={progressLabel}
        className="h-1.5"
      />
      <span>
        {progressLabel} · {KEEP_WORKING}
      </span>
    </span>
  );
};

export const showImportProgressToast = ({
  importId,
  title,
  doneCount,
  totalCount,
  unit,
}: {
  importId: string;
  title: string;
  doneCount: number;
  totalCount: number;
  unit: string;
}) => {
  const hasStepsToCount = totalCount > 1;
  toast.loading(title, {
    id: importToastId(importId),
    description: hasStepsToCount ? (
      <ProgressDescription
        doneCount={doneCount}
        totalCount={totalCount}
        unit={unit}
      />
    ) : (
      KEEP_WORKING
    ),
    duration: UNTIL_DISMISSED,
    className: "animate-attention-glow-arrival motion-reduce:animate-none",
  });
};
