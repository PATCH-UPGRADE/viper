"use client";

import {
  ArrowLeftIcon,
  ArrowRightIcon,
  CheckIcon,
  ChevronDownIcon,
  MinusIcon,
  TriangleAlertIcon,
} from "lucide-react";
import { type ReactNode, useId } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AssetStatus } from "@/generated/prisma";
import { cn, plural } from "@/lib/utils";
import {
  ASSET_IMPORT_FIELDS,
  type AssetImportField,
  CONSTANT_FIELDS,
  type ColumnMapping,
  type ConstantField,
  MAX_CELL_LENGTH,
  SAMPLE_ROW_COUNT,
} from "../contract";
import {
  fieldForHeader,
  type RequiredField,
  requiredFieldsNotSet,
  requiredFieldsWithoutColumn,
  type StatusValueRow,
} from "../review/columns";
import {
  FIELD_LABELS,
  fieldNameInSentence,
  formatCount,
  joinWithAnd,
} from "../review/labels";
import { REQUIRED_FIELDS } from "../rows";
import {
  ColumnTag,
  ImportFooter,
  StepHeading,
  StepLayout,
  ValueTag,
} from "./import-frame";
import type { LoadedFile } from "./upload-step";

type Tone = "confident" | "check" | "notImported";

const TONE_LABELS: Record<Tone, string> = {
  confident: "Confident",
  check: "Check this",
  notImported: "Not imported",
};

const TONE_STYLES: Record<Tone, string> = {
  confident:
    "border-emerald-600 bg-emerald-50 text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-100",
  check:
    "border-amber-500 bg-amber-50 text-amber-900 dark:bg-amber-950/40 dark:text-amber-100",
  notImported:
    "border-dashed border-muted-foreground/40 bg-muted text-muted-foreground",
};

const COLUMN_BORDERS: Record<Tone, string> = {
  confident: "border-emerald-600",
  check: "border-amber-500",
  notImported: "border-dashed border-muted-foreground/40",
};

const ToneIcon = ({ tone }: { tone: Tone }) => {
  if (tone === "confident") return <CheckIcon className="size-3.5" />;
  if (tone === "check") return <TriangleAlertIcon className="size-3.5" />;
  return <MinusIcon className="size-3.5" />;
};

const LEAVE_EMPTY = "leave-empty";

const STATUS_CHOICES = [
  AssetStatus.Active,
  AssetStatus.Maintenance,
  AssetStatus.Decommissioned,
] as const;

const isRequiredField = (field: AssetImportField): boolean =>
  (REQUIRED_FIELDS as readonly AssetImportField[]).includes(field);

const SETTABLE_FIELDS: ConstantField[] = [
  "status",
  ...CONSTANT_FIELDS.filter(
    (field) => field !== "status" && !isRequiredField(field),
  ),
];

const columnElementId = (columnIndex: number) => `csv-column-${columnIndex}`;

const FieldChips = ({
  file,
  mapping,
  toneFor,
}: {
  file: LoadedFile;
  mapping: ColumnMapping;
  toneFor: (field: AssetImportField) => Tone;
}) => {
  const fieldsFromColumns = ASSET_IMPORT_FIELDS.filter(
    (field) => mapping[field]?.kind === "column",
  );
  const scrollToColumn = (header: string) => {
    const column = document.getElementById(
      columnElementId(file.headers.indexOf(header)),
    );
    column?.scrollIntoView({
      behavior: "smooth",
      block: "nearest",
      inline: "center",
    });
    column?.querySelector("button")?.focus({ preventScroll: true });
  };

  return (
    <div className="flex flex-col gap-2">
      <span className="text-sm font-semibold">
        Found in your file
        <span className="font-normal text-muted-foreground">
          {" "}
          · {fieldsFromColumns.length} VIPER{" "}
          {plural("field", fieldsFromColumns.length)}, each with the column it
          comes from
        </span>
      </span>
      <div className="flex flex-wrap gap-1.5">
        {fieldsFromColumns.map((field) => {
          const source = mapping[field];
          if (source?.kind !== "column") return null;
          const tone = toneFor(field);
          return (
            <button
              key={field}
              type="button"
              title={TONE_LABELS[tone]}
              onClick={() => scrollToColumn(source.header)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-lg border-[1.5px] px-2.5 py-1 text-[13px] font-semibold",
                TONE_STYLES[tone],
              )}
            >
              <ToneIcon tone={tone} />
              {FIELD_LABELS[field]}
              <span className="font-mono text-[11px] font-normal text-muted-foreground">
                {source.header}
              </span>
              <span className="sr-only">. {TONE_LABELS[tone]}.</span>
            </button>
          );
        })}
      </div>
    </div>
  );
};

const ConstantInput = ({
  field,
  mapping,
  onSetConstant,
}: {
  field: ConstantField;
  mapping: ColumnMapping;
  onSetConstant: (field: AssetImportField, value: string) => void;
}) => {
  const inputId = useId();
  const source = mapping[field];
  const constantValue = source?.kind === "constant" ? source.value : "";
  const label = FIELD_LABELS[field];

  if (field === "status") {
    return (
      <div className="grid grid-cols-[150px_1fr] items-center gap-3">
        <label htmlFor={inputId} className="text-sm font-medium">
          {label}
        </label>
        <Select
          value={constantValue || LEAVE_EMPTY}
          onValueChange={(value) =>
            onSetConstant(field, value === LEAVE_EMPTY ? "" : value)
          }
        >
          <SelectTrigger id={inputId} className="w-45">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STATUS_CHOICES.map((status) => (
              <SelectItem key={status} value={status}>
                {status}
              </SelectItem>
            ))}
            <SelectItem value={LEAVE_EMPTY}>Leave empty</SelectItem>
          </SelectContent>
        </Select>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-[150px_1fr] items-center gap-3">
      <label htmlFor={inputId} className="text-sm font-medium">
        {label}
      </label>
      <div className="flex items-center gap-2.5">
        <Input
          id={inputId}
          className="w-45"
          value={constantValue}
          maxLength={MAX_CELL_LENGTH}
          placeholder="Leave empty"
          onChange={(event) => onSetConstant(field, event.target.value)}
        />
        <span className="text-[13px] text-muted-foreground">
          or type one {label.toLowerCase()} for all
        </span>
      </div>
    </div>
  );
};

const FieldsNotInFile = ({
  mapping,
  onSetConstant,
}: {
  mapping: ColumnMapping;
  onSetConstant: (field: AssetImportField, value: string) => void;
}) => {
  const isNotFromColumn = (field: AssetImportField) =>
    mapping[field]?.kind !== "column";
  const settableFields = SETTABLE_FIELDS.filter(isNotFromColumn);
  const emptyFields = ASSET_IMPORT_FIELDS.filter(
    (field) =>
      isNotFromColumn(field) &&
      !(CONSTANT_FIELDS as readonly string[]).includes(field),
  );
  if (settableFields.length === 0 && emptyFields.length === 0) return null;

  return (
    <div className="flex flex-col gap-2.5">
      <span className="text-sm font-semibold">
        Not in your file
        <span className="font-normal text-muted-foreground">
          {" "}
          · set one value for every device, or leave empty
        </span>
      </span>
      {settableFields.map((field) => (
        <ConstantInput
          key={field}
          field={field}
          mapping={mapping}
          onSetConstant={onSetConstant}
        />
      ))}
      {emptyFields.map((field) => (
        <div
          key={field}
          className="grid grid-cols-[150px_1fr] items-center gap-3"
        >
          <span className="text-sm font-medium">{FIELD_LABELS[field]}</span>
          <span className="w-fit rounded-md bg-muted px-2.5 py-1 text-[13px] text-muted-foreground">
            Left empty
          </span>
        </div>
      ))}
    </div>
  );
};

const ColumnFieldMenu = ({
  header,
  field,
  tone,
  mapping,
  onAssignColumn,
}: {
  header: string;
  field: AssetImportField | null;
  tone: Tone;
  mapping: ColumnMapping;
  onAssignColumn: (header: string, field: AssetImportField | null) => void;
}) => {
  const fieldLabel = field ? FIELD_LABELS[field] : "Not imported";
  const columnUsing = (candidate: AssetImportField) => {
    const source = mapping[candidate];
    return source?.kind === "column" && source.header !== header
      ? source.header
      : null;
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          title={TONE_LABELS[tone]}
          aria-label={`${header} goes to ${fieldLabel}. ${TONE_LABELS[tone]}.`}
          className={cn(
            "flex w-full items-center gap-1.5 rounded-md border-0 px-2 py-1.5 text-[13px] font-semibold",
            TONE_STYLES[tone],
          )}
        >
          <ToneIcon tone={tone} />
          <span className="flex-1 truncate text-left">{fieldLabel}</span>
          <ChevronDownIcon className="size-3.5" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-60">
        <DropdownMenuItem onSelect={() => onAssignColumn(header, null)}>
          {field === null ? <CheckIcon /> : <span className="size-4" />}
          Not imported
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        {ASSET_IMPORT_FIELDS.map((candidate) => {
          const otherColumn = columnUsing(candidate);
          return (
            <DropdownMenuItem
              key={candidate}
              onSelect={() => onAssignColumn(header, candidate)}
            >
              {candidate === field ? (
                <CheckIcon />
              ) : (
                <span className="size-4" />
              )}
              {FIELD_LABELS[candidate]}
              {otherColumn && (
                <span className="ml-auto truncate font-mono text-[11px] text-muted-foreground">
                  {otherColumn}
                </span>
              )}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

const SheetLegend = ({ rowCount }: { rowCount: number }) => (
  <div className="flex flex-wrap items-center gap-4 text-[13px]">
    <span className="text-sm font-semibold">Your file</span>
    {(["confident", "check", "notImported"] as const).map((tone) => (
      <span key={tone} className="flex items-center gap-1.5">
        <span
          className={cn(
            "flex size-3.5 items-center justify-center rounded border-[1.5px]",
            TONE_STYLES[tone],
          )}
        />
        {TONE_LABELS[tone]}
      </span>
    ))}
    <span className="text-muted-foreground">
      First {SAMPLE_ROW_COUNT} rows of {formatCount(rowCount)} · scroll sideways
      for more columns
    </span>
  </div>
);

const Sheet = ({
  file,
  mapping,
  toneFor,
  onAssignColumn,
}: {
  file: LoadedFile;
  mapping: ColumnMapping;
  toneFor: (field: AssetImportField) => Tone;
  onAssignColumn: (header: string, field: AssetImportField | null) => void;
}) => {
  const sampleRows = file.rows.slice(0, SAMPLE_ROW_COUNT);
  return (
    <div className="flex flex-col gap-2.5">
      <SheetLegend rowCount={file.rows.length} />
      <section
        aria-label="First 5 rows"
        className="overflow-x-auto rounded-lg pb-2"
      >
        <div className="flex w-max gap-1.5">
          {file.headers.map((header, columnIndex) => {
            const field = fieldForHeader(mapping, header);
            const tone = field ? toneFor(field) : "notImported";
            return (
              <fieldset
                key={header}
                id={columnElementId(columnIndex)}
                aria-label={header}
                className={cn(
                  "flex w-48 flex-col overflow-hidden rounded-lg border-[1.5px] bg-background",
                  COLUMN_BORDERS[tone],
                )}
              >
                <div className="p-1.5">
                  <ColumnFieldMenu
                    header={header}
                    field={field}
                    tone={tone}
                    mapping={mapping}
                    onAssignColumn={onAssignColumn}
                  />
                </div>
                <div className="truncate border-y bg-muted/50 px-2.5 py-1.5 font-mono text-xs font-medium text-muted-foreground">
                  {header}
                </div>
                {sampleRows.map((row, rowIndex) => (
                  <div
                    key={rowIndex}
                    className={cn(
                      "truncate px-2.5 py-1.5 text-[13px]",
                      field ? "text-foreground" : "text-muted-foreground",
                    )}
                  >
                    {row[columnIndex]?.trim() || "—"}
                  </div>
                ))}
              </fieldset>
            );
          })}
        </div>
      </section>
    </div>
  );
};

const StatusConfidence = ({ row }: { row: StatusValueRow }) => {
  if (row.needsPick) {
    return (
      <span className="flex items-center gap-1 text-xs text-amber-700 dark:text-amber-300">
        <TriangleAlertIcon className="size-3" />
        VIPER isn't sure about this value
      </span>
    );
  }
  if (row.picked) return <span />;
  return (
    <span className="flex items-center gap-1 text-xs text-emerald-700 dark:text-emerald-300">
      <CheckIcon className="size-3" />
      Confident
    </span>
  );
};

const RequiredFieldRow = ({
  file,
  field,
  mapping,
  onAssignColumn,
  onSetConstant,
}: {
  file: LoadedFile;
  field: RequiredField;
  mapping: ColumnMapping;
  onAssignColumn: (header: string, field: AssetImportField | null) => void;
  onSetConstant: (field: AssetImportField, value: string) => void;
}) => {
  const inputId = useId();
  const fieldName = fieldNameInSentence(field);
  const source = mapping[field];
  const valueForEveryDevice = source?.kind === "constant" ? source.value : "";
  return (
    <li className="flex flex-col gap-2 rounded-lg border bg-background p-3">
      {valueForEveryDevice ? (
        <span className="text-sm">
          Every device will get the {fieldName}{" "}
          <ValueTag value={valueForEveryDevice} />.
        </span>
      ) : (
        <span className="text-sm">
          No column in your file is set as the {fieldName}. VIPER needs{" "}
          {field === "manufacturer" ? "a manufacturer" : "a model"} for every
          device.
        </span>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Select
          value=""
          onValueChange={(header) => onAssignColumn(header, field)}
        >
          <SelectTrigger
            aria-label={`Column that holds the ${fieldName}`}
            className="w-64"
          >
            <SelectValue placeholder="Pick the column that holds it" />
          </SelectTrigger>
          <SelectContent>
            {file.headers.map((header) => (
              <SelectItem key={header} value={header}>
                {header}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <label htmlFor={inputId} className="text-[13px] text-muted-foreground">
          or type one {fieldName} for every device
        </label>
        <Input
          id={inputId}
          className="w-60"
          value={valueForEveryDevice}
          maxLength={MAX_CELL_LENGTH}
          onChange={(event) => onSetConstant(field, event.target.value)}
        />
      </div>
    </li>
  );
};

const RequiredFields = ({
  file,
  mapping,
  onAssignColumn,
  onSetConstant,
}: {
  file: LoadedFile;
  mapping: ColumnMapping;
  onAssignColumn: (header: string, field: AssetImportField | null) => void;
  onSetConstant: (field: AssetImportField, value: string) => void;
}) => {
  const fieldsWithoutColumn = requiredFieldsWithoutColumn(mapping);
  const stillNeedsAValue = requiredFieldsNotSet(mapping).length > 0;
  if (fieldsWithoutColumn.length === 0) return null;
  return (
    <section
      className={cn(
        "flex flex-col gap-2.5 rounded-lg border bg-background p-3",
        stillNeedsAValue &&
          "border-amber-300 bg-amber-50/60 dark:bg-amber-950/30",
      )}
    >
      <div className="flex flex-col gap-0.5">
        <h4 className="flex items-center gap-2 text-sm font-semibold">
          {stillNeedsAValue && (
            <TriangleAlertIcon className="size-4 text-amber-600" />
          )}
          Required for every device
        </h4>
        <p className="text-[13px] text-muted-foreground">
          VIPER needs a manufacturer and a model to know what each device is.
          Pick the column that holds each one, or type one value to use for
          every device. You can't continue until both are set.
        </p>
      </div>
      <ul className="flex flex-col gap-2">
        {fieldsWithoutColumn.map((field) => (
          <RequiredFieldRow
            key={field}
            file={file}
            field={field}
            mapping={mapping}
            onAssignColumn={onAssignColumn}
            onSetConstant={onSetConstant}
          />
        ))}
      </ul>
    </section>
  );
};

const EXAMPLE_VALUE_COUNT = 3;

const exampleValuesIn = (file: LoadedFile, header: string): string[] => {
  const columnIndex = file.headers.indexOf(header);
  const distinctValues = new Set<string>();
  for (const row of file.rows) {
    const value = row[columnIndex]?.trim();
    if (value) distinctValues.add(value);
    if (distinctValues.size === EXAMPLE_VALUE_COUNT) break;
  }
  return [...distinctValues];
};

const ColumnToConfirm = ({
  file,
  header,
  field,
  mapping,
  onAssignColumn,
}: {
  file: LoadedFile;
  header: string;
  field: AssetImportField;
  mapping: ColumnMapping;
  onAssignColumn: (header: string, field: AssetImportField | null) => void;
}) => {
  const fieldName = fieldNameInSentence(field);
  const exampleValues = exampleValuesIn(file, header);
  return (
    <li className="flex flex-col gap-2 rounded-lg border bg-background p-3">
      <span className="text-sm">
        Does the column <ColumnTag header={header} /> hold each device's{" "}
        {fieldName}? VIPER guessed so but isn't sure.
      </span>
      {exampleValues.length > 0 && (
        <span className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
          Example values in this column:
          {exampleValues.map((value) => (
            <ValueTag key={value} value={value} />
          ))}
        </span>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" onClick={() => onAssignColumn(header, field)}>
          <CheckIcon />
          Yes, this column is the {fieldName}
        </Button>
        <span className="text-[13px] text-muted-foreground">
          or pick what this column is
        </span>
        <div className="w-52">
          <ColumnFieldMenu
            header={header}
            field={field}
            tone="check"
            mapping={mapping}
            onAssignColumn={onAssignColumn}
          />
        </div>
      </div>
    </li>
  );
};

const ColumnsToConfirm = ({
  file,
  mapping,
  fieldsToConfirm,
  onAssignColumn,
}: {
  file: LoadedFile;
  mapping: ColumnMapping;
  fieldsToConfirm: AssetImportField[];
  onAssignColumn: (header: string, field: AssetImportField | null) => void;
}) => (
  <section className="flex flex-col gap-2.5 rounded-lg border border-amber-300 bg-amber-50/60 p-3 dark:bg-amber-950/30">
    <div className="flex flex-col gap-0.5">
      <h4 className="flex items-center gap-2 text-sm font-semibold">
        <TriangleAlertIcon className="size-4 text-amber-600" />
        {fieldsToConfirm.length} {plural("column", fieldsToConfirm.length)}{" "}
        VIPER isn't sure about
      </h4>
      <p className="text-[13px] text-muted-foreground">
        Look at the example values in each column, then confirm VIPER's guess or
        pick the VIPER field the column belongs to.
      </p>
    </div>
    <ul className="flex flex-col gap-2">
      {fieldsToConfirm.map((field) => {
        const source = mapping[field];
        if (source?.kind !== "column") return null;
        return (
          <ColumnToConfirm
            key={field}
            file={file}
            header={source.header}
            field={field}
            mapping={mapping}
            onAssignColumn={onAssignColumn}
          />
        );
      })}
    </ul>
  </section>
);

const StatusValues = ({
  statusHeader,
  statusRows,
  onPickStatus,
}: {
  statusHeader: string;
  statusRows: StatusValueRow[];
  onPickStatus: (value: string, status: AssetStatus | null) => void;
}) => {
  const valuesToPick = statusRows.filter((row) => row.needsPick).length;
  return (
    <section
      className={cn(
        "flex flex-col gap-2.5 rounded-lg border bg-background p-3",
        valuesToPick > 0 &&
          "border-amber-300 bg-amber-50/60 dark:bg-amber-950/30",
      )}
    >
      <div className="flex flex-col gap-0.5">
        <h4 className="text-sm font-semibold">
          What do the values in the column <ColumnTag header={statusHeader} />{" "}
          mean?
        </h4>
        <p className="text-[13px] text-muted-foreground">
          {valuesToPick > 0
            ? `Each value in this column becomes a device's status in VIPER. Pick a VIPER status for the ${valuesToPick} ${plural("value", valuesToPick)} VIPER isn't sure about.`
            : "Each value in this column becomes a device's status in VIPER. Change a value's status if it looks wrong."}
        </p>
      </div>
      <div className="grid grid-cols-[minmax(100px,220px)_80px_20px_200px_auto] items-center gap-x-2.5 gap-y-2 text-[13px]">
        <span className="text-xs font-medium text-muted-foreground">
          Value in this column
        </span>
        <span />
        <span />
        <span className="text-xs font-medium text-muted-foreground">
          Status it becomes in VIPER
        </span>
        <span />
        {statusRows.map((row) => {
          const selectedValue = row.needsPick
            ? ""
            : (row.status ?? LEAVE_EMPTY);
          return (
            <div key={row.value} className="contents">
              <span className="min-w-0">
                <ValueTag value={row.value} />
              </span>
              <span className="text-muted-foreground">
                {formatCount(row.rowCount)} {plural("row", row.rowCount)}
              </span>
              <ArrowRightIcon className="size-3.5 text-muted-foreground" />
              <Select
                value={selectedValue}
                onValueChange={(value) =>
                  onPickStatus(
                    row.value,
                    value === LEAVE_EMPTY ? null : (value as AssetStatus),
                  )
                }
              >
                <SelectTrigger
                  aria-label={`VIPER status for the value ${row.value}`}
                  className={cn(
                    "w-50",
                    row.needsPick &&
                      "animate-attention-glow-brief motion-reduce:animate-none",
                  )}
                >
                  <SelectValue placeholder="Pick a VIPER status" />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_CHOICES.map((status) => (
                    <SelectItem key={status} value={status}>
                      {status}
                    </SelectItem>
                  ))}
                  <SelectItem value={LEAVE_EMPTY}>Leave empty</SelectItem>
                </SelectContent>
              </Select>
              <StatusConfidence row={row} />
            </div>
          );
        })}
      </div>
    </section>
  );
};

export const ColumnsStep = ({
  file,
  mapping,
  columnChecks,
  fieldsToConfirm,
  statusRows,
  nav,
  onAssignColumn,
  onSetConstant,
  onPickStatus,
  onBack,
  onNext,
}: {
  file: LoadedFile;
  mapping: ColumnMapping;
  columnChecks: AssetImportField[];
  fieldsToConfirm: AssetImportField[];
  statusRows: StatusValueRow[];
  nav: ReactNode;
  onAssignColumn: (header: string, field: AssetImportField | null) => void;
  onSetConstant: (field: AssetImportField, value: string) => void;
  onPickStatus: (value: string, status: AssetStatus | null) => void;
  onBack: () => void;
  onNext: () => void;
}) => {
  const toneFor = (field: AssetImportField): Tone =>
    columnChecks.includes(field) ? "check" : "confident";
  const statusHeader =
    mapping.status?.kind === "column" ? mapping.status.header : null;
  const checkCount = columnChecks.length;
  const requiredNamesToSet =
    requiredFieldsNotSet(mapping).map(fieldNameInSentence);
  const mustSetRequiredFields = requiredNamesToSet.length > 0;
  const needsAttention = checkCount > 0 || mustSetRequiredFields;
  const columnsLeftHint =
    checkCount > 0
      ? `${checkCount} ${plural("column", checkCount)} left to check`
      : undefined;
  const statusValuesNeedPick = statusRows.some((row) => row.needsPick);
  const statusValues = statusHeader !== null && statusRows.length > 0 && (
    <StatusValues
      statusHeader={statusHeader}
      statusRows={statusRows}
      onPickStatus={onPickStatus}
    />
  );

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
            mustSetRequiredFields
              ? `Set the ${joinWithAnd(requiredNamesToSet)} to continue.`
              : columnsLeftHint
          }
          right={
            <Button disabled={mustSetRequiredFields} onClick={onNext}>
              Next: Manufacturers & products
              <ArrowRightIcon />
            </Button>
          }
        />
      }
    >
      <StepHeading
        eyebrow="Step A of C"
        title={
          needsAttention
            ? "Did VIPER read your columns correctly?"
            : "VIPER read all your columns"
        }
        description={
          needsAttention
            ? undefined
            : "Every column matched with confidence. Change a field if it looks wrong, or continue."
        }
      />
      <RequiredFields
        file={file}
        mapping={mapping}
        onAssignColumn={onAssignColumn}
        onSetConstant={onSetConstant}
      />
      {fieldsToConfirm.length > 0 && (
        <ColumnsToConfirm
          file={file}
          mapping={mapping}
          fieldsToConfirm={fieldsToConfirm}
          onAssignColumn={onAssignColumn}
        />
      )}
      {statusValuesNeedPick && statusValues}
      <div className="flex flex-col gap-3.5 rounded-xl border bg-background p-4">
        <FieldChips file={file} mapping={mapping} toneFor={toneFor} />
        <FieldsNotInFile mapping={mapping} onSetConstant={onSetConstant} />
      </div>
      <Sheet
        file={file}
        mapping={mapping}
        toneFor={toneFor}
        onAssignColumn={onAssignColumn}
      />
      {!statusValuesNeedPick && statusValues}
    </StepLayout>
  );
};
