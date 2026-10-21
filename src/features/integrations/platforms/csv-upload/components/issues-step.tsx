"use client";

import {
  ArrowLeftIcon,
  ArrowRightIcon,
  CheckIcon,
  CircleAlertIcon,
  TriangleAlertIcon,
} from "lucide-react";
import { type ReactNode, useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RadioGroup } from "@/components/ui/radio-group";
import { cn, plural } from "@/lib/utils";
import {
  type AssetImportField,
  type ColumnMapping,
  MAX_CELL_LENGTH,
  type StagedRow,
} from "../contract";
import {
  columnIssueKey,
  dominantKind,
  type EditedRows,
  INVALID_VALUE_KINDS,
  type IssueChoice,
  type IssueGroup,
  issueCardsFor,
  issueKeysFor,
  problemWithValue,
  REPEATED_ROWS_ISSUE_KEY,
} from "../review/issues";
import {
  FIELD_LABELS,
  FIELD_PLURALS,
  fieldNameInSentence,
  formatCount,
  withArticle,
} from "../review/labels";
import type { RepeatedRow } from "../review/plan";
import type { ColumnIssue } from "../validate";
import {
  ColumnTag,
  ImportFooter,
  OutlinedChoice,
  StepHeading,
  StepLayout,
} from "./import-frame";

const EDITABLE_ROW_LIMIT = 5;
const ROWS_SHOWN_AT_FIRST = 5;
const MOST_ROWS_SHOWN = 50;

const columnHeaderOf = (
  mapping: ColumnMapping,
  field: AssetImportField,
): string | null => {
  const source = mapping[field];
  return source?.kind === "column" ? source.header : null;
};

const headerOf = (mapping: ColumnMapping, field: AssetImportField) => {
  const source = mapping[field];
  return source?.kind === "column" ? source.header : FIELD_LABELS[field];
};

const groupTitle = (group: IssueGroup, header: string) => {
  const count = group.issues.length;
  const label = FIELD_LABELS[group.field];
  if (INVALID_VALUE_KINDS.includes(group.kind)) {
    return count === 1
      ? `1 ${label} isn't valid`
      : `${formatCount(count)} ${FIELD_PLURALS[group.field]} aren't valid`;
  }
  if (group.kind === "tooLong") {
    return `${formatCount(count)} ${plural("value", count)} in ${header} ${count === 1 ? "is" : "are"} too long`;
  }
  return `${formatCount(count)} ${plural("row", count)} ${count === 1 ? "has" : "have"} no ${label.toLowerCase()}`;
};

const groupDescription = (group: IssueGroup, canEditValues: boolean) => {
  const fieldWithArticle = withArticle(fieldNameInSentence(group.field));
  if (INVALID_VALUE_KINDS.includes(group.kind)) {
    return canEditValues
      ? `Type the right value in the highlighted column to keep it. A value you leave as it is will be imported empty, so that device will have no ${fieldNameInSentence(group.field)}.`
      : `These devices will be imported without ${fieldWithArticle}. To keep the values, fix them in your file and upload it again.`;
  }
  if (group.kind === "tooLong") {
    return canEditValues
      ? `Shorten a value in the highlighted column, or leave it and it will be cut to ${MAX_CELL_LENGTH} characters.`
      : `They'll be cut to ${MAX_CELL_LENGTH} characters.`;
  }
  return canEditValues
    ? `VIPER can't import a device without ${fieldWithArticle}. Type one in the highlighted column to keep the row. A row you leave empty won't be imported.`
    : `VIPER can't import a device without ${fieldWithArticle}, so these rows won't be imported.`;
};

const flagTitle = (column: ColumnIssue, header: string) => {
  const kind = dominantKind(column);
  if (INVALID_VALUE_KINDS.includes(kind)) {
    return `Most values in ${header} aren't valid ${FIELD_PLURALS[column.field]}`;
  }
  if (kind === "tooLong") {
    return `Most values in ${header} are longer than ${MAX_CELL_LENGTH} characters`;
  }
  return `Most rows have no ${FIELD_LABELS[column.field].toLowerCase()}`;
};

const STOP_LABEL = "Stop and fix the CSV";
const SKIP_ROWS_LABEL = "Skip these rows and continue";

const columnContinueLabel = (column: ColumnIssue) => {
  const kind = dominantKind(column);
  if (INVALID_VALUE_KINDS.includes(kind)) {
    return `Import without ${FIELD_PLURALS[column.field]} and continue`;
  }
  if (kind === "tooLong") {
    return `Cut values to ${MAX_CELL_LENGTH} characters and continue`;
  }
  return SKIP_ROWS_LABEL;
};

const groupContinueLabel = (group: IssueGroup) => {
  if (INVALID_VALUE_KINDS.includes(group.kind)) {
    return group.issues.length === 1
      ? "Leave it empty and continue"
      : "Leave them empty and continue";
  }
  if (group.kind === "tooLong") {
    return `Cut to ${MAX_CELL_LENGTH} characters and continue`;
  }
  return SKIP_ROWS_LABEL;
};

const issuesHeading = (flagCount: number, hasRowProblems: boolean) => {
  const description = "Choose what to do with each one before you continue.";
  if (flagCount === 1) {
    return { title: "One column doesn't look right", description };
  }
  if (flagCount > 1) {
    return { title: `${flagCount} columns don't look right`, description };
  }
  if (hasRowProblems) {
    return { title: "A few values couldn't be read", description };
  }
  return {
    title: "Every value could be read",
    description: "Nothing for you to decide here.",
  };
};

const IssueChoices = ({
  question,
  continueLabel,
  choice,
  onChoose,
}: {
  question: string;
  continueLabel: string;
  choice: IssueChoice | undefined;
  onChoose: (choice: IssueChoice) => void;
}) => (
  <RadioGroup
    value={choice ?? ""}
    aria-label={question}
    className="flex flex-wrap gap-2"
    onValueChange={(value) => onChoose(value as IssueChoice)}
  >
    <OutlinedChoice
      value="continue"
      label={continueLabel}
      isChosen={choice === "continue"}
      asksToBePicked={choice === undefined}
    />
    <OutlinedChoice
      value="stop"
      label={STOP_LABEL}
      isChosen={choice === "stop"}
      asksToBePicked={false}
    />
  </RadioGroup>
);

const IssueCard = ({
  icon,
  title,
  description,
  isResolved = false,
  children,
}: {
  icon: ReactNode;
  title: string;
  description?: string;
  isResolved?: boolean;
  children: ReactNode;
}) => (
  <div
    className={cn(
      "flex flex-col gap-3 rounded-xl border p-4",
      isResolved
        ? "border-emerald-200 bg-emerald-50/40 dark:bg-emerald-950/20"
        : "border-amber-200",
    )}
  >
    <div className="flex gap-2.5">
      {icon}
      <div className="flex flex-col gap-0.5">
        <span className="text-[15px] font-semibold">{title}</span>
        {description && (
          <span className="text-[13px] text-muted-foreground">
            {description}
          </span>
        )}
      </div>
    </div>
    {children}
  </div>
);

interface PreviewRow {
  rowNumber: number;
  cells: string[];
  note?: string;
  isFixed?: boolean;
}

const EditableCell = ({
  label,
  value,
  problem,
  isFixed,
  onCommit,
}: {
  label: string;
  value: string;
  problem: Pick<IssueGroup, "field" | "kind">;
  isFixed: boolean;
  onCommit: (value: string) => void;
}) => {
  const [draft, setDraft] = useState(value);
  const messageId = useId();
  const typedValue = draft.trim();
  const isChanged = typedValue !== value.trim();
  const whatIsWrong = problemWithValue(problem.kind, problem.field, draft);
  const showsAsFixed = isFixed && !isChanged;
  const applyIfValid = () => {
    if (isChanged && whatIsWrong === null) onCommit(typedValue);
  };
  const goBackToAppliedValue = () => {
    if (whatIsWrong !== null) setDraft(value);
  };
  return (
    <span className="flex flex-col gap-1">
      <span className="flex items-center gap-1.5">
        <Input
          aria-label={showsAsFixed ? `${label}, fixed` : label}
          aria-invalid={whatIsWrong !== null}
          aria-describedby={messageId}
          className={cn(
            "h-8 w-48 bg-background font-mono text-[13px]",
            showsAsFixed &&
              "border-emerald-500 ring-1 ring-emerald-500/40 dark:border-emerald-500",
          )}
          value={draft}
          placeholder="Type the value"
          onChange={(event) => setDraft(event.target.value)}
          onBlur={() => {
            applyIfValid();
            goBackToAppliedValue();
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") applyIfValid();
          }}
        />
        {showsAsFixed && (
          <CheckIcon aria-hidden className="size-4 shrink-0 text-emerald-600" />
        )}
      </span>
      <span id={messageId} className="max-w-64 text-xs whitespace-normal">
        {whatIsWrong !== null && (
          <span className="text-red-700 dark:text-red-400">{whatIsWrong}</span>
        )}
        {whatIsWrong === null && isChanged && (
          <span className="text-muted-foreground">Press Enter to apply.</span>
        )}
      </span>
    </span>
  );
};

const ProblemValue = ({ value }: { value: string }) =>
  value ? (
    <span className="font-mono text-red-700 dark:text-red-400">{value}</span>
  ) : (
    <span className="text-muted-foreground italic">empty</span>
  );

const RowPreviewTable = ({
  headers,
  problemHeader,
  problem,
  rows,
  canEditValues,
  onEditCell,
}: {
  headers: string[];
  problemHeader: string | null;
  problem: Pick<IssueGroup, "field" | "kind"> | null;
  rows: PreviewRow[];
  canEditValues: boolean;
  onEditCell: (rowNumber: number, header: string, value: string) => void;
}) => {
  const problemColumnIndex =
    problemHeader === null ? -1 : headers.indexOf(problemHeader);
  const otherColumnIndexes = headers
    .map((_header, columnIndex) => columnIndex)
    .filter((columnIndex) => columnIndex !== problemColumnIndex);
  const hasNotes = rows.some((row) => row.note !== undefined);
  const [showsEveryRow, setShowsEveryRow] = useState(false);
  const hasMoreRows = rows.length > ROWS_SHOWN_AT_FIRST;
  const shownRows = rows.slice(
    0,
    showsEveryRow ? MOST_ROWS_SHOWN : ROWS_SHOWN_AT_FIRST,
  );
  const rowsLeftOut = rows.length - shownRows.length;
  const expandLabel =
    rows.length > MOST_ROWS_SHOWN
      ? `Show the first ${MOST_ROWS_SHOWN} rows`
      : `Show all ${formatCount(rows.length)} rows`;

  return (
    <section
      aria-label="The rows as they are in your file"
      className="overflow-hidden rounded-md border bg-background"
    >
      <div className="max-h-72 overflow-auto">
        <table className="w-max min-w-full border-collapse text-[13px]">
          <thead className="sticky top-0 z-10">
            <tr className="border-b bg-muted text-left text-xs text-muted-foreground">
              <th scope="col" className="px-2.5 py-1.5 font-medium">
                Row
              </th>
              {hasNotes && (
                <th scope="col" className="px-2.5 py-1.5 font-medium">
                  Why
                </th>
              )}
              {problemHeader !== null && problemColumnIndex !== -1 && (
                <th
                  scope="col"
                  className="bg-amber-50 px-2.5 py-1.5 font-medium dark:bg-amber-950/30"
                >
                  Column <ColumnTag header={problemHeader} />
                </th>
              )}
              {otherColumnIndexes.map((columnIndex) => (
                <th
                  key={columnIndex}
                  scope="col"
                  className="px-2.5 py-1.5 font-mono font-medium"
                >
                  {headers[columnIndex]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {shownRows.map((row) => (
              <tr key={row.rowNumber} className="border-b last:border-b-0">
                <th
                  scope="row"
                  className="px-2.5 py-1.5 text-left font-normal text-muted-foreground"
                >
                  {row.rowNumber}
                </th>
                {hasNotes && (
                  <td className="px-2.5 py-1.5 text-red-700 dark:text-red-400">
                    {row.note}
                  </td>
                )}
                {problemHeader !== null && problemColumnIndex !== -1 && (
                  <td className="bg-amber-50 px-2.5 py-1.5 dark:bg-amber-950/30">
                    {canEditValues && problem !== null ? (
                      <EditableCell
                        label={`${problemHeader} for row ${row.rowNumber}`}
                        value={row.cells[problemColumnIndex] ?? ""}
                        problem={problem}
                        isFixed={row.isFixed === true}
                        onCommit={(value) =>
                          onEditCell(row.rowNumber, problemHeader, value)
                        }
                      />
                    ) : (
                      <ProblemValue
                        value={(row.cells[problemColumnIndex] ?? "").trim()}
                      />
                    )}
                  </td>
                )}
                {otherColumnIndexes.map((columnIndex) => (
                  <td
                    key={columnIndex}
                    className="max-w-56 truncate px-2.5 py-1.5"
                  >
                    {row.cells[columnIndex]?.trim() || "—"}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {hasMoreRows && (
        <div className="flex items-center gap-3 border-t bg-muted/40 px-2.5 py-1.5 text-xs text-muted-foreground">
          <Button
            variant="link"
            size="sm"
            className="h-auto p-0 text-xs"
            onClick={() => setShowsEveryRow((showsAll) => !showsAll)}
          >
            {showsEveryRow
              ? `Show only the first ${ROWS_SHOWN_AT_FIRST} rows`
              : expandLabel}
          </Button>
          {showsEveryRow && rowsLeftOut > 0 && (
            <span>
              Showing the first {MOST_ROWS_SHOWN} of {formatCount(rows.length)}{" "}
              rows.
            </span>
          )}
          {!showsEveryRow && (
            <span>
              {formatCount(rowsLeftOut)} more {plural("row", rowsLeftOut)} not
              shown.
            </span>
          )}
        </div>
      )}
    </section>
  );
};

const FlaggedColumnCard = ({
  column,
  header,
  choice,
  onChoose,
}: {
  column: ColumnIssue;
  header: string;
  choice: IssueChoice | undefined;
  onChoose: (choice: IssueChoice) => void;
}) => {
  const examples = [
    ...new Set(column.issues.map((issue) => issue.value).filter(Boolean)),
  ].slice(0, 3);
  return (
    <IssueCard
      icon={<CircleAlertIcon className="size-4.5 shrink-0 text-red-600" />}
      title={flagTitle(column, header)}
      description={`${formatCount(column.failedCount)} of ${formatCount(column.totalRows)} values couldn't be read.`}
    >
      {examples.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-muted-foreground">For example</span>
          {examples.map((example) => (
            <span
              key={example}
              className="rounded bg-red-50 px-1.5 py-0.5 font-mono text-xs text-red-700 dark:bg-red-950/40 dark:text-red-300"
            >
              {example}
            </span>
          ))}
        </div>
      )}
      <IssueChoices
        question={`What to do with ${header}`}
        continueLabel={columnContinueLabel(column)}
        choice={choice}
        onChoose={onChoose}
      />
    </IssueCard>
  );
};

export const IssuesStep = ({
  mapping,
  flaggedColumns,
  groups,
  repeatedRows,
  rowsByNumber,
  headers,
  choices,
  editedRows,
  onChoose,
  onEditCell,
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
  const cellsOfRow = (rowNumber: number): string[] =>
    rowsByNumber.get(rowNumber)?.raw ?? [];
  const issueKeys = issueKeysFor(flaggedColumns, groups, repeatedRows.length);
  const choseToStop = issueKeys.some(
    (issueKey) => choices[issueKey] === "stop",
  );
  const undecidedCount = issueKeys.filter(
    (issueKey) => choices[issueKey] === undefined,
  ).length;
  const needsMoreChoices = undecidedCount > 0 && !choseToStop;
  const flagCount = flaggedColumns.length;
  const hasRowProblems = groups.length > 0 || repeatedRows.length > 0;
  const heading = issuesHeading(flagCount, hasRowProblems);

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
          hint={
            needsMoreChoices
              ? `Choose what to do with ${undecidedCount} ${plural("issue", undecidedCount)} first.`
              : undefined
          }
          right={
            choseToStop ? (
              <Button variant="destructive" onClick={onCancelImport}>
                Stop importing and fix the CSV
              </Button>
            ) : (
              <Button disabled={needsMoreChoices} onClick={onContinue}>
                Continue to confirm
                <ArrowRightIcon />
              </Button>
            )
          }
        />
      }
    >
      <StepHeading eyebrow="Step C of C" {...heading} />
      {flaggedColumns.map((column) => (
        <FlaggedColumnCard
          key={column.field}
          column={column}
          header={headerOf(mapping, column.field)}
          choice={choices[columnIssueKey(column)]}
          onChoose={(choice) => onChoose(columnIssueKey(column), choice)}
        />
      ))}
      {issueCardsFor(groups, editedRows).map((card) => {
        const problemHeader = columnHeaderOf(mapping, card.field);
        const header = headerOf(mapping, card.field);
        const openGroup: IssueGroup = {
          field: card.field,
          kind: card.kind,
          issues: card.openIssues,
        };
        const rowCount = card.openIssues.length + card.fixedRowNumbers.length;
        const canEditValues =
          problemHeader !== null && rowCount < EDITABLE_ROW_LIMIT;
        const everyRowIsFixed = card.openIssues.length === 0;
        const fixedCount = card.fixedRowNumbers.length;
        const openRows: PreviewRow[] = card.openIssues.map((issue) => ({
          rowNumber: issue.rowNumber,
          cells: cellsOfRow(issue.rowNumber),
        }));
        const fixedRows: PreviewRow[] = card.fixedRowNumbers.map(
          (rowNumber) => ({
            rowNumber,
            cells: cellsOfRow(rowNumber),
            isFixed: true,
          }),
        );
        const rowsInFileOrder = [...openRows, ...fixedRows].sort(
          (first, second) => first.rowNumber - second.rowNumber,
        );
        return (
          <IssueCard
            key={card.key}
            isResolved={everyRowIsFixed}
            icon={
              everyRowIsFixed ? (
                <CheckIcon className="size-4.5 shrink-0 text-emerald-600" />
              ) : (
                <TriangleAlertIcon className="size-4.5 shrink-0 text-amber-600" />
              )
            }
            title={
              everyRowIsFixed
                ? `${formatCount(fixedCount)} ${plural("value", fixedCount)} in ${header} fixed`
                : groupTitle(openGroup, header)
            }
            description={
              everyRowIsFixed
                ? "You fixed these here. Change a value again if it isn't right."
                : groupDescription(openGroup, canEditValues)
            }
          >
            <RowPreviewTable
              headers={headers}
              problemHeader={problemHeader}
              problem={card}
              rows={rowsInFileOrder}
              canEditValues={canEditValues}
              onEditCell={(rowNumber, editedHeader, value) =>
                onEditCell(card, rowNumber, editedHeader, value)
              }
            />
            {!everyRowIsFixed && (
              <IssueChoices
                question={groupTitle(openGroup, header)}
                continueLabel={groupContinueLabel(openGroup)}
                choice={choices[card.key]}
                onChoose={(choice) => onChoose(card.key, choice)}
              />
            )}
          </IssueCard>
        );
      })}
      {repeatedRows.length > 0 && (
        <IssueCard
          icon={
            <TriangleAlertIcon className="size-4.5 shrink-0 text-amber-600" />
          }
          title={`${formatCount(repeatedRows.length)} ${plural("row", repeatedRows.length)} ${repeatedRows.length === 1 ? "repeats" : "repeat"} a device earlier in the file`}
          description="These rows won't be imported."
        >
          <RowPreviewTable
            headers={headers}
            problemHeader={null}
            problem={null}
            rows={repeatedRows.map((repeatedRow) => ({
              rowNumber: repeatedRow.rowNumber,
              cells: cellsOfRow(repeatedRow.rowNumber),
              note: repeatedRow.reason,
            }))}
            canEditValues={false}
            onEditCell={() => undefined}
          />
          <IssueChoices
            question="What to do with the repeated rows"
            continueLabel={SKIP_ROWS_LABEL}
            choice={choices[REPEATED_ROWS_ISSUE_KEY]}
            onChoose={(choice) => onChoose(REPEATED_ROWS_ISSUE_KEY, choice)}
          />
        </IssueCard>
      )}
      {(flagCount > 0 || hasRowProblems) && (
        <div className="flex items-center gap-2 text-sm">
          <CheckIcon className="size-4 text-emerald-600" />
          Every other value is valid.
        </div>
      )}
    </StepLayout>
  );
};
