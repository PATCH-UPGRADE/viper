import Papa from "papaparse";
import {
  MAX_CELL_LENGTH,
  MAX_DISTINCT_VALUES,
  MAX_IMPORT_FILE_BYTES,
  SAMPLE_ROW_COUNT,
} from "../contract";

export interface ParsedCsv {
  headers: string[];
  rows: string[][];
}

export type CsvFileProblem =
  | { kind: "notCsv" }
  | { kind: "tooLarge"; sizeBytes: number }
  | { kind: "noRows" };

export const problemBeforeReading = (file: {
  name: string;
  size: number;
}): CsvFileProblem | null => {
  const hasCsvExtension = file.name.toLowerCase().endsWith(".csv");
  if (!hasCsvExtension) return { kind: "notCsv" };
  if (file.size > MAX_IMPORT_FILE_BYTES) {
    return { kind: "tooLarge", sizeBytes: file.size };
  }
  return null;
};

const uniqueHeaders = (headerCells: string[]): string[] => {
  const timesSeen = new Map<string, number>();
  return headerCells.map((cell, index) => {
    const name = cell.trim() || `Column ${index + 1}`;
    const seenBefore = timesSeen.get(name) ?? 0;
    timesSeen.set(name, seenBefore + 1);
    return seenBefore === 0 ? name : `${name} (${seenBefore + 1})`;
  });
};

export const parseCsvFile = (text: string): ParsedCsv => {
  const parsed = Papa.parse<string[]>(text, {
    header: false,
    skipEmptyLines: "greedy",
  });
  const [headerCells = [], ...deviceRows] = parsed.data;
  return { headers: uniqueHeaders(headerCells), rows: deviceRows };
};

const cellAt = (row: string[], columnIndex: number): string =>
  (row[columnIndex] ?? "").trim();

export const distinctValuesByHeader = (
  headers: string[],
  rows: string[][],
  max: number = MAX_DISTINCT_VALUES,
): Record<string, string[]> => {
  const columnsWithFewValues = headers.flatMap((header, columnIndex) => {
    const valuesInColumn = new Set<string>();
    for (const row of rows) {
      const value = cellAt(row, columnIndex);
      if (value) valuesInColumn.add(value.slice(0, MAX_CELL_LENGTH));
      if (valuesInColumn.size > max) return [];
    }
    const columnValues: [string, string[]] = [header, [...valuesInColumn]];
    return [columnValues];
  });
  return Object.fromEntries(columnsWithFewValues);
};

export const sampleRowsFor = (
  headers: string[],
  rows: string[][],
): Record<string, string>[] =>
  rows
    .slice(0, SAMPLE_ROW_COUNT)
    .map((row) =>
      Object.fromEntries(
        headers.map((header, columnIndex) => [
          header,
          cellAt(row, columnIndex),
        ]),
      ),
    );

export const countRowsByValue = (
  headers: string[],
  rows: string[][],
  header: string,
): Map<string, number> => {
  const columnIndex = headers.indexOf(header);
  const rowsByValue = new Map<string, number>();
  if (columnIndex === -1) return rowsByValue;
  for (const row of rows) {
    const value = cellAt(row, columnIndex);
    if (value) rowsByValue.set(value, (rowsByValue.get(value) ?? 0) + 1);
  }
  return rowsByValue;
};
