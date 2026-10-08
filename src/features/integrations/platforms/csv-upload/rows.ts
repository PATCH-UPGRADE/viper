import { normalizeSerial } from "../../core/sync/serials";
import {
  type AssetImportField,
  assetStatusSchema,
  CONSTANT_FIELDS,
  type ColumnMapping,
  type ConstantField,
  type CsvAssetRow,
  MAX_CELL_LENGTH,
  type StatusValues,
} from "./contract";
import { isValidIp, isValidMac, normalizeMac, type RowIssue } from "./validate";

export interface BuildRowsInput {
  headers: string[];
  rawRows: string[][];
  rowNumbers: number[];
  mapping: ColumnMapping;
  statusValues: StatusValues;
}

export interface BuiltRows {
  rows: CsvAssetRow[];
  issues: RowIssue[];
}

type TextField = Exclude<AssetImportField, "status">;

export const REQUIRED_FIELDS = [
  "manufacturer",
  "product",
] as const satisfies readonly TextField[];

const isConstantField = (field: AssetImportField): field is ConstantField =>
  (CONSTANT_FIELDS as readonly AssetImportField[]).includes(field);

const blankToNull = (value: string | undefined): string | null => {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
};

export function buildRows(input: BuildRowsInput): BuiltRows {
  const { headers, rawRows, rowNumbers, mapping, statusValues } = input;
  const statusByCellValue = new Map(Object.entries(statusValues));
  const issues: RowIssue[] = [];

  const rows = rawRows.map((cells, dataIndex): CsvAssetRow => {
    const rowNumber = rowNumbers[dataIndex];

    const sourceValue = (field: AssetImportField): string | null => {
      const source = mapping[field];
      if (!source) return null;
      if (source.kind === "constant") {
        return isConstantField(field) ? blankToNull(source.value) : null;
      }
      const columnIndex = headers.indexOf(source.header);
      return columnIndex === -1 ? null : blankToNull(cells[columnIndex]);
    };

    const cutToCellLength = (field: TextField): string | null => {
      const value = sourceValue(field);
      if (value === null || value.length <= MAX_CELL_LENGTH) return value;
      issues.push({ rowNumber, field, kind: "tooLong", value });
      return value.slice(0, MAX_CELL_LENGTH);
    };

    const validatedAddress = (
      field: "ip" | "macAddress",
      isValid: (value: string) => boolean,
    ): string | null => {
      const value = sourceValue(field);
      if (value === null || isValid(value)) return value;
      const kind = field === "ip" ? "invalidIp" : "invalidMac";
      issues.push({ rowNumber, field, kind, value });
      return null;
    };

    const readStatus = (): CsvAssetRow["status"] => {
      const source = mapping.status;
      const value = sourceValue("status");
      if (!source || value === null) return null;
      if (source.kind === "constant") {
        const constantStatus = assetStatusSchema.safeParse(value);
        return constantStatus.success ? constantStatus.data : null;
      }
      return statusByCellValue.get(value) ?? null;
    };

    const macAsTyped = validatedAddress("macAddress", isValidMac);
    const row: CsvAssetRow = {
      rowNumber,
      role: cutToCellLength("role"),
      manufacturer: cutToCellLength("manufacturer"),
      product: cutToCellLength("product"),
      version: cutToCellLength("version"),
      serialNumber: normalizeSerial(cutToCellLength("serialNumber")),
      ip: validatedAddress("ip", isValidIp),
      macAddress: macAsTyped === null ? null : normalizeMac(macAsTyped),
      hostname: cutToCellLength("hostname"),
      networkSegment: cutToCellLength("networkSegment"),
      status: readStatus(),
      facility: cutToCellLength("facility"),
      building: cutToCellLength("building"),
      floor: cutToCellLength("floor"),
      room: cutToCellLength("room"),
    };

    for (const field of REQUIRED_FIELDS) {
      if (row[field] === null) {
        issues.push({ rowNumber, field, kind: "missing", value: "" });
      }
    }
    return row;
  });

  return { rows, issues };
}
