"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { toast } from "sonner";
import { plural } from "@/lib/utils";
import {
  hasFailures,
  isFinished,
  useImportStatus,
} from "../hooks/use-csv-import";
import { formatCount } from "../review/labels";
import {
  importToastId,
  showImportProgressToast,
} from "./import-progress-toast";

const UNTIL_DISMISSED = Number.POSITIVE_INFINITY;

export const ImportWatcher = ({
  importId,
  isShownInOverlay,
  opensResultWhenFinished,
  onFinished,
  onViewResult,
}: {
  importId: string;
  isShownInOverlay: boolean;
  opensResultWhenFinished: boolean;
  onFinished: (importId: string) => void;
  onViewResult: (importId: string) => void;
}) => {
  const router = useRouter();
  const { data: status, isError } = useImportStatus(importId);
  const toastId = importToastId(importId);

  useEffect(() => {
    if (!isError) return;
    toast.dismiss(toastId);
    onFinished(importId);
  }, [isError, importId, onFinished, toastId]);

  useEffect(() => {
    if (!status) return;
    const finished = isFinished(status);
    const resultOpensByItself = finished && opensResultWhenFinished;
    if (isShownInOverlay || resultOpensByItself) {
      toast.dismiss(toastId);
    } else if (!finished) {
      showImportProgressToast({
        importId,
        title: `Importing ${status.sourceName}…`,
        doneCount: status.addedCount + status.linkedCount + status.failedCount,
        totalCount: status.totalRows,
        unit: "row",
      });
    } else if (hasFailures(status)) {
      const failedCount = status.failedCount;
      toast.error(
        failedCount > 0
          ? `${status.sourceName} finished with ${formatCount(failedCount)} ${plural("error", failedCount)}`
          : `${status.sourceName} stopped early`,
        {
          id: toastId,
          duration: UNTIL_DISMISSED,
          closeButton: true,
          action: {
            label: "View details",
            onClick: () => onViewResult(importId),
          },
        },
      );
    } else {
      toast.success(`${status.sourceName} is done`, {
        id: toastId,
        description: `${formatCount(status.addedCount)} added · ${formatCount(status.linkedCount)} linked`,
        duration: UNTIL_DISMISSED,
        closeButton: true,
        action: {
          label: "View devices",
          onClick: () => router.push(`/assets?source=${status.integrationId}`),
        },
      });
    }
    if (resultOpensByItself) onViewResult(importId);
    if (finished) onFinished(importId);
  }, [
    status,
    isShownInOverlay,
    opensResultWhenFinished,
    toastId,
    importId,
    onFinished,
    onViewResult,
    router,
  ]);

  return null;
};
