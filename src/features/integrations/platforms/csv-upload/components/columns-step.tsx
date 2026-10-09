"use client";

import { ArrowLeftIcon, ArrowRightIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AssetStatus } from "@/generated/prisma";
import {
  ASSET_IMPORT_FIELDS,
  type AssetImportField,
  CONSTANT_FIELDS,
  type ColumnMapping,
} from "../contract";
import type { StatusValueRow } from "../review/columns";
import { FIELD_LABELS } from "../review/labels";
import { ImportFooter, StepHeading, StepLayout } from "./import-frame";
import type { LoadedFile } from "./upload-step";

const NO_COLUMN = "";
const NOT_PICKED = "";
const LEAVE_EMPTY = "leave-empty";
const STATUS_CHOICES = [
  AssetStatus.Active,
  AssetStatus.Maintenance,
  AssetStatus.Decommissioned,
];
const SELECT_STYLE = "h-9 rounded-md border bg-background px-2 text-sm";

const canHoldOneValue = (field: AssetImportField): boolean =>
  (CONSTANT_FIELDS as readonly AssetImportField[]).includes(field);

const FieldRow = ({
  field,
  headers,
  mapping,
  needsConfirming,
  onAssignColumn,
  onSetConstant,
}: {
  field: AssetImportField;
  headers: string[];
  mapping: ColumnMapping;
  needsConfirming: boolean;
  onAssignColumn: (header: string, field: AssetImportField | null) => void;
  onSetConstant: (field: AssetImportField, value: string) => void;
}) => {
  const label = FIELD_LABELS[field];
  const source = mapping[field];
  const header = source?.kind === "column" ? source.header : NO_COLUMN;
  const valueForEveryRow = source?.kind === "constant" ? source.value : "";
  const hasColumn = header !== NO_COLUMN;

  const pickColumn = (pickedHeader: string) => {
    if (pickedHeader !== NO_COLUMN) {
      onAssignColumn(pickedHeader, field);
    } else if (hasColumn) {
      onAssignColumn(header, null);
    }
  };

  return (
    <tr className="border-b">
      <th scope="row" className="py-2 pr-4 text-left text-sm font-medium">
        {label}
      </th>
      <td className="py-2 pr-4">
        <select
          aria-label={`Column for ${label}`}
          className={SELECT_STYLE}
          value={header}
          onChange={(event) => pickColumn(event.target.value)}
        >
          <option value={NO_COLUMN}>Not in the file</option>
          {headers.map((fileHeader) => (
            <option key={fileHeader} value={fileHeader}>
              {fileHeader}
            </option>
          ))}
        </select>
      </td>
      <td className="py-2 pr-4">
        {!hasColumn && canHoldOneValue(field) && (
          <Input
            aria-label={`One ${label} for every row`}
            placeholder="One value for every row"
            value={valueForEveryRow}
            onChange={(event) => onSetConstant(field, event.target.value)}
          />
        )}
      </td>
      <td className="py-2">
        {needsConfirming && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => onAssignColumn(header, field)}
          >
            Confirm
          </Button>
        )}
      </td>
    </tr>
  );
};

const StatusValueLine = ({
  row,
  onPickStatus,
}: {
  row: StatusValueRow;
  onPickStatus: (value: string, status: AssetStatus | null) => void;
}) => {
  const selectedValue = row.needsPick
    ? NOT_PICKED
    : (row.status ?? LEAVE_EMPTY);
  return (
    <li className="flex items-center gap-3 text-sm">
      <span className="w-40 truncate font-medium">{row.value}</span>
      <span className="w-24 text-muted-foreground">{row.rowCount} rows</span>
      <select
        aria-label={`VIPER status for ${row.value}`}
        className={SELECT_STYLE}
        value={selectedValue}
        onChange={(event) => {
          const picked = event.target.value;
          onPickStatus(
            row.value,
            picked === LEAVE_EMPTY ? null : (picked as AssetStatus),
          );
        }}
      >
        <option value={NOT_PICKED} disabled>
          Pick a status
        </option>
        {STATUS_CHOICES.map((status) => (
          <option key={status} value={status}>
            {status}
          </option>
        ))}
        <option value={LEAVE_EMPTY}>Leave empty</option>
      </select>
    </li>
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
  const checkCount = columnChecks.length;
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
          hint={checkCount > 0 ? `${checkCount} left` : undefined}
          right={
            <Button onClick={onNext}>
              Next: Manufacturers & products
              <ArrowRightIcon />
            </Button>
          }
        />
      }
    >
      <StepHeading
        eyebrow="Step A of C"
        title="Which column is which?"
        description="VIPER filled these in from your file. Change any that are wrong."
      />
      <table className="w-full max-w-3xl">
        <tbody>
          {ASSET_IMPORT_FIELDS.map((field) => (
            <FieldRow
              key={field}
              field={field}
              headers={file.headers}
              mapping={mapping}
              needsConfirming={fieldsToConfirm.includes(field)}
              onAssignColumn={onAssignColumn}
              onSetConstant={onSetConstant}
            />
          ))}
        </tbody>
      </table>
      {statusRows.length > 0 && (
        <section className="flex flex-col gap-2">
          <h4 className="text-sm font-semibold">Status values in your file</h4>
          <ul className="flex flex-col gap-2">
            {statusRows.map((row) => (
              <StatusValueLine
                key={row.value}
                row={row}
                onPickStatus={onPickStatus}
              />
            ))}
          </ul>
        </section>
      )}
    </StepLayout>
  );
};
