"use client";

import {
  ArrowRightIcon,
  CircleCheckIcon,
  CircleXIcon,
  DownloadIcon,
  Link2Icon,
  PlusIcon,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { downloadBlob } from "@/features/mitigation/components/briefing-export";
import { plural } from "@/lib/utils";
import type { ImportStatus } from "../contract";
import {
  hasFailures,
  isFinished,
  useFetchFailedRowsCsv,
  useImportFailures,
} from "../hooks/use-csv-import";
import { formatCount } from "../review/labels";
import type { NameDecisionSummary } from "../review/names";
import { ImportFooter, ProgressPanel, StepLayout } from "./import-frame";

const nameSummaryLine = (summary: NameDecisionSummary) =>
  [
    `${summary.newManufacturers.length} new ${plural("manufacturer", summary.newManufacturers.length)}`,
    `${summary.newProducts.length} new ${plural("product", summary.newProducts.length)}`,
    `${summary.savedSpellings.length} ${plural("spelling", summary.savedSpellings.length)} saved`,
  ].join(" · ");

const ViewDevicesButton = ({
  status,
  onViewDevices,
}: {
  status: ImportStatus;
  onViewDevices: (integrationId: string) => void;
}) => (
  <Button onClick={() => onViewDevices(status.integrationId)}>
    View devices from {status.sourceName}
    <ArrowRightIcon />
  </Button>
);

const Applying = ({ onClose }: { onClose: () => void }) => (
  <StepLayout
    footer={
      <ImportFooter
        right={
          <Button variant="outline" onClick={onClose}>
            Close and keep working
          </Button>
        }
      />
    }
  >
    <ProgressPanel
      title="Applying changes…"
      description="This can take a minute or two for a large file. You can close this window. VIPER keeps working and shows a notice when it's done."
    />
  </StepLayout>
);

const Applied = ({
  status,
  nameSummary,
  onClose,
  onViewDevices,
}: {
  status: ImportStatus;
  nameSummary: NameDecisionSummary | null;
  onClose: () => void;
  onViewDevices: (integrationId: string) => void;
}) => (
  <StepLayout
    footer={
      <ImportFooter
        left={
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        }
        right={
          <ViewDevicesButton status={status} onViewDevices={onViewDevices} />
        }
      />
    }
  >
    <output className="mx-auto flex w-full max-w-md flex-col items-center gap-4 py-10 text-center">
      <span className="flex size-12 items-center justify-center rounded-full bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40">
        <CircleCheckIcon className="size-6" />
      </span>
      <span className="text-[22px] font-semibold">Upload applied</span>
      <div className="grid w-full grid-cols-2 divide-x rounded-lg border">
        <div className="flex items-center gap-2.5 px-4 py-3">
          <span className="flex size-7 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40">
            <PlusIcon className="size-3.5" />
          </span>
          <span className="flex flex-col items-start">
            <span className="text-lg font-semibold">
              {formatCount(status.addedCount)}
            </span>
            <span className="text-xs text-muted-foreground">added</span>
          </span>
        </div>
        <div className="flex items-center gap-2.5 px-4 py-3">
          <span className="flex size-7 items-center justify-center rounded-lg bg-violet-50 text-violet-700 dark:bg-violet-950/40">
            <Link2Icon className="size-3.5" />
          </span>
          <span className="flex flex-col items-start">
            <span className="text-lg font-semibold">
              {formatCount(status.linkedCount)}
            </span>
            <span className="text-xs text-muted-foreground">linked</span>
          </span>
        </div>
      </div>
      {nameSummary && (
        <span className="text-[13px] text-muted-foreground">
          {nameSummaryLine(nameSummary)}
        </span>
      )}
    </output>
  </StepLayout>
);

const FailedRows = ({
  status,
  onViewDevices,
}: {
  status: ImportStatus;
  onViewDevices: (integrationId: string) => void;
}) => {
  const fetchFailedRowsCsv = useFetchFailedRowsCsv();
  const { data: failures } = useImportFailures(status.importId);
  const appliedCount = status.addedCount + status.linkedCount;
  const stoppedEarly = status.failedCount === 0;
  const shownFailures = failures?.items ?? [];
  const moreCount = (failures?.total ?? 0) - shownFailures.length;

  const downloadFailedRows = async () => {
    try {
      const { fileName, csv } = await fetchFailedRowsCsv(status.importId);
      downloadBlob(
        new Blob([csv], { type: "text/csv;charset=utf-8" }),
        fileName,
      );
    } catch (error) {
      toast.error("Couldn't download the failed rows", {
        description: error instanceof Error ? error.message : undefined,
      });
    }
  };

  return (
    <StepLayout
      footer={
        <ImportFooter
          left={
            status.failedCount > 0 && (
              <Button variant="outline" onClick={downloadFailedRows}>
                <DownloadIcon />
                Download {formatCount(status.failedCount)} failed{" "}
                {plural("row", status.failedCount)} (.csv)
              </Button>
            )
          }
          right={
            <ViewDevicesButton status={status} onViewDevices={onViewDevices} />
          }
        />
      }
    >
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
        <div className="flex items-start gap-3.5">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-red-50 text-red-600 dark:bg-red-950/40">
            <CircleXIcon className="size-5" />
          </span>
          {stoppedEarly ? (
            <div>
              <div className="text-[22px] font-semibold">
                {formatCount(appliedCount)} applied. The import stopped early.
              </div>
              <div className="text-sm text-muted-foreground">
                Rows already applied stay in VIPER. Uploading the file again
                adds a new source; rows with no serial, MAC or hostname would be
                added twice.
              </div>
            </div>
          ) : (
            <div>
              <div className="text-[22px] font-semibold">
                {formatCount(appliedCount)} applied,{" "}
                {formatCount(status.failedCount)} failed
              </div>
              <div className="text-sm text-muted-foreground">
                The {formatCount(status.failedCount)}{" "}
                {plural("row", status.failedCount)} below{" "}
                {status.failedCount === 1 ? "was" : "were"} not saved.
                Everything else is in VIPER.
              </div>
            </div>
          )}
        </div>
        {shownFailures.length > 0 && (
          <div className="overflow-hidden rounded-lg border text-[13px]">
            <div className="grid grid-cols-[56px_220px_1fr] gap-3 bg-muted/50 px-3 py-2 font-medium text-muted-foreground">
              <span>Row</span>
              <span>Device</span>
              <span>Reason</span>
            </div>
            {shownFailures.map((failure) => (
              <div
                key={failure.rowNumber}
                className="grid grid-cols-[56px_220px_1fr] gap-3 border-t px-3 py-2"
              >
                <span className="text-xs text-muted-foreground">
                  {failure.rowNumber}
                </span>
                <span className="truncate">{failure.label}</span>
                <span>{failure.reason}</span>
              </div>
            ))}
          </div>
        )}
        {!stoppedEarly && (
          <span className="text-xs text-muted-foreground">
            {moreCount > 0 ? `and ${formatCount(moreCount)} more. ` : ""}The
            download has your original columns plus a Reason column.
          </span>
        )}
      </div>
    </StepLayout>
  );
};

export const ResultStep = ({
  status,
  nameSummary,
  onClose,
  onViewDevices,
}: {
  status: ImportStatus | undefined;
  nameSummary: NameDecisionSummary | null;
  onClose: () => void;
  onViewDevices: (integrationId: string) => void;
}) => {
  if (!status || !isFinished(status)) return <Applying onClose={onClose} />;
  if (hasFailures(status)) {
    return <FailedRows status={status} onViewDevices={onViewDevices} />;
  }
  return (
    <Applied
      status={status}
      nameSummary={nameSummary}
      onClose={onClose}
      onViewDevices={onViewDevices}
    />
  );
};
