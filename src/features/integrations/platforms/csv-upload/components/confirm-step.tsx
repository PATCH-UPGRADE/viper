"use client";

import { ArrowLeftIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { plural } from "@/lib/utils";
import type { LinkedAsset, StagedRow } from "../contract";
import type { IssueGroup } from "../review/issues";
import { formatCount } from "../review/labels";
import type { NameDecisionSummary } from "../review/names";
import type { RowFailure } from "../review/outcomes";
import {
  ImportFooter,
  type ReviewStep,
  StepHeading,
  StepLayout,
} from "./import-frame";

export interface OpenReviewItem {
  step: ReviewStep;
  count: number;
}

const STEP_LABELS: Record<ReviewStep, string> = {
  columns: "Columns",
  names: "Manufacturers & products",
  issues: "Data issues",
};

const FAILURES_SHOWN = 20;

export const ConfirmStep = ({
  addedRows,
  linkedAssets,
  failures,
  nameSummary,
  droppedHeaders,
  openItems,
  isApplying,
  onBack,
  onGoToStep,
  onApply,
}: {
  addedRows: StagedRow[];
  linkedAssets: LinkedAsset[];
  failures: RowFailure[];
  rowsByNumber: Map<number, StagedRow>;
  nameSummary: NameDecisionSummary;
  invalidGroups: IssueGroup[];
  droppedHeaders: string[];
  openItems: OpenReviewItem[];
  isApplying: boolean;
  onBack: () => void;
  onGoToStep: (step: ReviewStep) => void;
  onApply: () => void;
}) => {
  const openItemCount = openItems.reduce(
    (total, openItem) => total + openItem.count,
    0,
  );
  const canApply = openItemCount === 0 && !isApplying;
  const newNameCount =
    nameSummary.newManufacturers.length + nameSummary.newProducts.length;
  const failuresShown = failures.slice(0, FAILURES_SHOWN);

  return (
    <StepLayout
      footer={
        <ImportFooter
          left={
            <Button variant="outline" onClick={onBack}>
              <ArrowLeftIcon />
              Back to review
            </Button>
          }
          hint={
            openItemCount > 0
              ? `Resolve ${openItemCount} remaining ${plural("item", openItemCount)} first.`
              : undefined
          }
          right={
            <Button disabled={!canApply} onClick={onApply}>
              Apply changes
            </Button>
          }
        />
      }
    >
      <StepHeading
        title="Here's what will happen"
        description="Nothing has been saved yet."
      />
      {openItems.length > 0 && (
        <ul className="flex max-w-3xl flex-col gap-2 text-sm">
          {openItems.map((openItem) => (
            <li
              key={openItem.step}
              className="flex items-center justify-between gap-3 rounded-md border p-3"
            >
              <span>
                {STEP_LABELS[openItem.step]}: {openItem.count} left
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => onGoToStep(openItem.step)}
              >
                Go to {STEP_LABELS[openItem.step]}
              </Button>
            </li>
          ))}
        </ul>
      )}
      <ul className="flex max-w-3xl flex-col gap-1 text-sm">
        <li>
          {formatCount(addedRows.length)} {plural("device", addedRows.length)}{" "}
          will be added
        </li>
        <li>
          {formatCount(linkedAssets.length)} will be linked to devices already
          in VIPER
        </li>
        <li>
          {formatCount(failures.length)} {plural("row", failures.length)} will
          not be saved
        </li>
        <li>
          {formatCount(newNameCount)} new manufacturer and product{" "}
          {plural("name", newNameCount)}
        </li>
        {droppedHeaders.length > 0 && (
          <li>Columns left out: {droppedHeaders.join(", ")}</li>
        )}
      </ul>
      {failuresShown.length > 0 && (
        <section className="flex max-w-3xl flex-col gap-1 text-sm">
          <h4 className="font-semibold">Rows that will not be saved</h4>
          <ul className="text-muted-foreground">
            {failuresShown.map((failure) => (
              <li key={failure.rowNumber}>
                Row {failure.rowNumber}: {failure.reason}
              </li>
            ))}
          </ul>
          {failures.length > failuresShown.length && (
            <span className="text-muted-foreground">
              and {formatCount(failures.length - failuresShown.length)} more
            </span>
          )}
        </section>
      )}
    </StepLayout>
  );
};
