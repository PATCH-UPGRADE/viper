"use client";

import { ArrowLeftIcon, ArrowRightIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import {
  type ColumnMapping,
  MAX_CELL_LENGTH,
  type StagedRow,
} from "../contract";
import {
  type EditedRows,
  fieldsToLeaveOut,
  type IssueChoice,
  type IssueGroup,
  issueKeysFor,
} from "../review/issues";
import { FIELD_LABELS, formatCount } from "../review/labels";
import type { RepeatedRow } from "../review/plan";
import type { ColumnIssue, RowIssueKind } from "../validate";
import { ImportFooter, StepHeading, StepLayout } from "./import-frame";

const ROW_NUMBERS_SHOWN = 10;

const WHAT_HAPPENS: Record<RowIssueKind, string> = {
  invalidIp: "not a valid IP address, imported empty",
  invalidMac: "not a valid MAC address, imported empty",
  tooLong: `longer than ${MAX_CELL_LENGTH} characters, cut to fit`,
  missing: "missing, so the row will not be saved",
};

const rowNumbersText = (rowNumbers: number[]): string => {
  const shownRowNumbers = rowNumbers.slice(0, ROW_NUMBERS_SHOWN).join(", ");
  const hiddenCount = rowNumbers.length - ROW_NUMBERS_SHOWN;
  return hiddenCount > 0
    ? `rows ${shownRowNumbers} and ${formatCount(hiddenCount)} more`
    : `rows ${shownRowNumbers}`;
};

export const IssuesStep = ({
  flaggedColumns,
  groups,
  repeatedRows,
  choices,
  onChoose,
  nav,
  onBack,
  onContinue,
  onCancelImport,
}: {
  mapping: ColumnMapping;
  flaggedColumns: ColumnIssue[];
  groups: IssueGroup[];
  repeatedRows: RepeatedRow[];
  rowsByNumber: Map<number, StagedRow>;
  headers: string[];
  choices: Record<string, IssueChoice>;
  editedRows: Record<string, EditedRows>;
  onChoose: (issueKey: string, choice: IssueChoice) => void;
  onEditCell: (
    group: Pick<IssueGroup, "field" | "kind">,
    rowNumber: number,
    header: string,
    value: string,
  ) => void;
  nav: ReactNode;
  onBack: () => void;
  onContinue: () => void;
  onCancelImport: () => void;
}) => {
  const fieldsLeftOut = fieldsToLeaveOut(flaggedColumns);
  const issueKeys = issueKeysFor(flaggedColumns, groups, repeatedRows.length);
  const hasIssues = issueKeys.length > 0;

  const acceptAndContinue = () => {
    for (const issueKey of issueKeys) {
      if (choices[issueKey] === undefined) onChoose(issueKey, "continue");
    }
    onContinue();
  };

  return (
    <StepLayout
      nav={nav}
      footer={
        <ImportFooter
          left={
            <Button variant="outline" onClick={onBack}>
              <ArrowLeftIcon />
              Back
            </Button>
          }
          right={
            <>
              {hasIssues && (
                <Button variant="outline" onClick={onCancelImport}>
                  Cancel and fix the file
                </Button>
              )}
              <Button onClick={acceptAndContinue}>
                {hasIssues ? "Accept and continue" : "Continue to confirm"}
                <ArrowRightIcon />
              </Button>
            </>
          }
        />
      }
    >
      <StepHeading
        eyebrow="Step C of C"
        title={
          hasIssues ? "Some values don't fit" : "Every value could be read"
        }
        description={
          hasIssues
            ? "This is what VIPER will do with them."
            : "Nothing for you to decide here."
        }
      />
      <ul className="flex max-w-3xl flex-col gap-2 text-sm">
        {flaggedColumns.map((column) => (
          <li key={column.field} className="rounded-md border p-3">
            <span className="font-medium">{FIELD_LABELS[column.field]}</span>
            {": "}
            {formatCount(column.failedCount)} of {formatCount(column.totalRows)}{" "}
            values don't fit.{" "}
            {fieldsLeftOut.includes(column.field)
              ? "The column will be left out."
              : "The rest of each row is kept."}
          </li>
        ))}
        {groups.map((group) => (
          <li
            key={`${group.field}:${group.kind}`}
            className="rounded-md border p-3"
          >
            <span className="font-medium">{FIELD_LABELS[group.field]}</span>
            {": "}
            {WHAT_HAPPENS[group.kind]} (
            {rowNumbersText(group.issues.map((issue) => issue.rowNumber))})
          </li>
        ))}
        {repeatedRows.length > 0 && (
          <li className="rounded-md border p-3">
            <span className="font-medium">Repeated serial or MAC address</span>
            {": "}
            {rowNumbersText(repeatedRows.map((row) => row.rowNumber))} will not
            be saved.
          </li>
        )}
      </ul>
    </StepLayout>
  );
};
