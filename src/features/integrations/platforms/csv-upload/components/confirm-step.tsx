"use client";

import {
  ArrowLeftIcon,
  ArrowRightIcon,
  CircleXIcon,
  EraserIcon,
  Link2Icon,
  PlusIcon,
  TagIcon,
  TriangleAlertIcon,
} from "lucide-react";
import { type ReactNode, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { plural } from "@/lib/utils";
import type { LinkedAsset, StagedRow } from "../contract";
import type { IssueGroup } from "../review/issues";
import {
  FIELD_LABELS,
  FIELD_PLURALS,
  formatCount,
  joinWithAnd,
  rowLabel,
} from "../review/labels";
import type { NameDecisionSummary } from "../review/names";
import type { RowFailure } from "../review/outcomes";
import {
  ImportFooter,
  type ReviewStep,
  StepHeading,
  StepLayout,
} from "./import-frame";
import { IdentifierCell, SeeListDialog, TwoLineCell } from "./see-list-dialog";

type OpenList = "added" | "linked" | "failed" | null;

const ROW_NUMBER_COLUMN = "w-16 text-muted-foreground tabular-nums";

const makeAndModelOf = (row: StagedRow): string =>
  [row.manufacturer, row.product].filter(Boolean).join(" ") || "—";

const locationOf = (row: StagedRow): string =>
  [row.building, row.floor, row.room].filter(Boolean).join(" · ") || "—";

const SummaryLine = ({
  icon,
  iconClassName,
  count,
  text,
  detail,
  onSeeList,
}: {
  icon: ReactNode;
  iconClassName: string;
  count: number;
  text: string;
  detail?: string;
  onSeeList?: () => void;
}) => (
  <div className="flex items-center gap-4 px-5 py-4">
    <span
      className={`flex size-9 shrink-0 items-center justify-center rounded-lg ${iconClassName}`}
    >
      {icon}
    </span>
    <div className="flex flex-1 flex-col gap-0.5">
      <span className="text-base">
        <strong className="font-semibold">{formatCount(count)}</strong> {text}
      </span>
      {detail && (
        <span className="text-[13px] text-muted-foreground">{detail}</span>
      )}
    </div>
    {onSeeList && (
      <Button variant="link" size="sm" onClick={onSeeList}>
        See list
      </Button>
    )}
  </div>
);

const newNamesText = (summary: NameDecisionSummary) => {
  const manufacturerCount = summary.newManufacturers.length;
  const productCount = summary.newProducts.length;
  const productPart = `new product ${plural("name", productCount)}`;
  if (manufacturerCount === 0) {
    return { count: productCount, text: productPart };
  }
  const manufacturerPart = `new ${plural("manufacturer", manufacturerCount)}`;
  return {
    count: manufacturerCount,
    text:
      productCount > 0
        ? `${manufacturerPart} and ${formatCount(productCount)} ${productPart}`
        : manufacturerPart,
  };
};

export interface OpenReviewItem {
  step: ReviewStep;
  count: number;
}

const OPEN_ITEM_WORDING: Record<
  ReviewStep,
  { stepLabel: string; whatIsLeft: (count: number) => string }
> = {
  columns: {
    stepLabel: "Columns",
    whatIsLeft: (count) => `${count} ${plural("column", count)} to check`,
  },
  names: {
    stepLabel: "Manufacturers & products",
    whatIsLeft: (count) => `${count} ${plural("question", count)} to answer`,
  },
  issues: {
    stepLabel: "Data issues",
    whatIsLeft: (count) => `${count} ${plural("issue", count)} to decide`,
  },
};

const OpenItemsCard = ({
  openItems,
  onGoToStep,
}: {
  openItems: OpenReviewItem[];
  onGoToStep: (step: ReviewStep) => void;
}) => (
  <div className="flex flex-col gap-3 rounded-xl border border-amber-300 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-950/30">
    <div className="flex items-center gap-2.5">
      <TriangleAlertIcon className="size-4.5 shrink-0 text-amber-600" />
      <span className="text-[15px] font-semibold">
        Finish the review before you apply
      </span>
    </div>
    <ul className="flex flex-col gap-2">
      {openItems.map((openItem) => {
        const wording = OPEN_ITEM_WORDING[openItem.step];
        return (
          <li
            key={openItem.step}
            className="flex items-center justify-between gap-3 rounded-lg bg-background px-3 py-2"
          >
            <span className="text-sm">
              <strong className="font-semibold">{wording.stepLabel}</strong>
              <span className="text-muted-foreground">
                {" "}
                · {wording.whatIsLeft(openItem.count)}
              </span>
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => onGoToStep(openItem.step)}
            >
              Go to {wording.stepLabel}
              <ArrowRightIcon />
            </Button>
          </li>
        );
      })}
    </ul>
  </div>
);

export const ConfirmStep = ({
  addedRows,
  linkedAssets,
  failures,
  rowsByNumber,
  nameSummary,
  invalidGroups,
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
  const [openList, setOpenList] = useState<OpenList>(null);
  const closeList = (open: boolean) => {
    if (!open) setOpenList(null);
  };
  const newNames = newNamesText(nameSummary);
  const newNameList = [
    nameSummary.newManufacturers.join(", "),
    nameSummary.newProducts.join(", "),
  ]
    .filter(Boolean)
    .join(" · ");
  const savedSpellingCount = nameSummary.savedSpellings.length;
  const openItemCount = openItems.reduce(
    (total, openItem) => total + openItem.count,
    0,
  );
  const canApply = openItemCount === 0 && !isApplying;

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
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-5">
        <StepHeading
          title="Here's what will happen"
          description="Nothing has been saved yet."
        />
        {openItems.length > 0 && (
          <OpenItemsCard openItems={openItems} onGoToStep={onGoToStep} />
        )}
        <div className="divide-y rounded-xl border">
          <SummaryLine
            icon={<PlusIcon className="size-4.5" />}
            iconClassName="bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40"
            count={addedRows.length}
            text={`${plural("device", addedRows.length)} will be added`}
            detail="Owned by you"
            onSeeList={
              addedRows.length > 0 ? () => setOpenList("added") : undefined
            }
          />
          <SummaryLine
            icon={<Link2Icon className="size-4.5" />}
            iconClassName="bg-violet-50 text-violet-700 dark:bg-violet-950/40"
            count={linkedAssets.length}
            text="will be linked to devices already in VIPER"
            onSeeList={
              linkedAssets.length > 0 ? () => setOpenList("linked") : undefined
            }
          />
          {newNames.count > 0 && (
            <SummaryLine
              icon={<TagIcon className="size-4.5" />}
              iconClassName="bg-muted text-foreground"
              count={newNames.count}
              text={newNames.text}
              detail={newNameList}
            />
          )}
          {savedSpellingCount > 0 && (
            <SummaryLine
              icon={<TagIcon className="size-4.5" />}
              iconClassName="bg-muted text-foreground"
              count={savedSpellingCount}
              text={`${plural("spelling", savedSpellingCount)} will be saved as other names`}
              detail={nameSummary.savedSpellings.join(", ")}
            />
          )}
          {invalidGroups.map((group) => (
            <SummaryLine
              key={group.field}
              icon={<EraserIcon className="size-4.5" />}
              iconClassName="bg-muted text-foreground"
              count={group.issues.length}
              text={`${group.issues.length === 1 ? FIELD_LABELS[group.field] : FIELD_PLURALS[group.field]} will be left empty`}
              detail="They weren't valid"
            />
          ))}
          {droppedHeaders.length > 0 && (
            <SummaryLine
              icon={<EraserIcon className="size-4.5" />}
              iconClassName="bg-muted text-foreground"
              count={droppedHeaders.length}
              text={`${plural("column", droppedHeaders.length)} won't be imported`}
              detail={`${joinWithAnd(droppedHeaders)} · most values couldn't be read`}
            />
          )}
          {failures.length > 0 && (
            <SummaryLine
              icon={<CircleXIcon className="size-4.5" />}
              iconClassName="bg-red-50 text-red-700 dark:bg-red-950/40"
              count={failures.length}
              text={`${plural("row", failures.length)} won't be saved`}
              onSeeList={() => setOpenList("failed")}
            />
          )}
        </div>
      </div>
      <SeeListDialog
        open={openList === "added"}
        onOpenChange={closeList}
        title={`${formatCount(addedRows.length)} ${plural("device", addedRows.length)} will be added`}
        items={addedRows}
        keyOf={(row) => String(row.rowNumber)}
        description="Each row below becomes a new device in VIPER."
        columns={[
          {
            header: "Row",
            className: ROW_NUMBER_COLUMN,
            cell: (row) => row.rowNumber,
          },
          {
            header: "Device",
            cell: (row) => (
              <TwoLineCell title={makeAndModelOf(row)} detail={row.role} />
            ),
          },
          {
            header: "Serial number",
            cell: (row) => <IdentifierCell value={row.serialNumber} />,
          },
          {
            header: "IP address",
            cell: (row) => <IdentifierCell value={row.ip} />,
          },
          {
            header: "Location",
            className: "text-muted-foreground",
            cell: locationOf,
          },
        ]}
      />
      <SeeListDialog
        open={openList === "linked"}
        onOpenChange={closeList}
        title={`${formatCount(linkedAssets.length)} ${plural("device", linkedAssets.length)} already in VIPER`}
        description="Your rows will be attached to these devices."
        items={linkedAssets}
        keyOf={(asset) => asset.id}
        columns={[
          {
            header: "Device",
            className: "font-medium",
            cell: (asset) => asset.label,
          },
          {
            header: "Serial number",
            cell: (asset) => <IdentifierCell value={asset.serialNumber} />,
          },
          {
            header: "Already reported by",
            cell: (asset) => (
              <span className="flex flex-wrap gap-1.5">
                {asset.platforms.map((platform) => (
                  <Badge key={platform} variant="outline">
                    {platform}
                  </Badge>
                ))}
              </span>
            ),
          },
        ]}
      />
      <SeeListDialog
        open={openList === "failed"}
        onOpenChange={closeList}
        title={`${formatCount(failures.length)} ${plural("row", failures.length)} won't be saved`}
        items={failures}
        keyOf={(failure) => String(failure.rowNumber)}
        columns={[
          {
            header: "Row",
            className: ROW_NUMBER_COLUMN,
            cell: (failure) => failure.rowNumber,
          },
          {
            header: "Device",
            className: "font-medium",
            cell: (failure) => {
              const row = rowsByNumber.get(failure.rowNumber);
              return row ? rowLabel(row) : "—";
            },
          },
          {
            header: "Reason",
            className: "text-red-700 dark:text-red-300",
            cell: (failure) => failure.reason,
          },
        ]}
      />
    </StepLayout>
  );
};
