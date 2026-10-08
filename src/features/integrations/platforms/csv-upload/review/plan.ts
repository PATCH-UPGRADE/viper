import type {
  ColumnMapping,
  MatchKeysRow,
  StagedRow,
  StatusValues,
} from "../contract";
import { findInFileConflicts } from "../import/conflicts";
import { buildRows } from "../rows";
import { type ColumnIssue, columnIssues } from "../validate";
import { dropFields } from "./columns";
import type { ParsedCsv } from "./csv-file";
import { fieldsToLeaveOut, type IssueGroup, rowIssueGroups } from "./issues";

export interface RepeatedRow {
  rowNumber: number;
  reason: string;
}

export interface ImportReview {
  flaggedColumns: ColumnIssue[];
  issueGroups: IssueGroup[];
  planMapping: ColumnMapping;
  importRows: StagedRow[];
  conflicts: Map<number, string>;
  repeatedRows: RepeatedRow[];
  rowsByNumber: Map<number, StagedRow>;
}

export const matchKeysOf = (row: StagedRow): MatchKeysRow => ({
  rowNumber: row.rowNumber,
  manufacturer: row.manufacturer,
  product: row.product,
  serialNumber: row.serialNumber,
  macAddress: row.macAddress,
  hostname: row.hostname,
});

export const importReviewFor = (
  file: ParsedCsv,
  mapping: ColumnMapping,
  chosenStatuses: StatusValues,
): ImportReview => {
  const rowsWithEveryColumn = buildRows({
    headers: file.headers,
    rawRows: file.rows,
    rowNumbers: file.rowNumbers,
    mapping,
    statusValues: chosenStatuses,
  });
  const flaggedColumns = columnIssues(
    rowsWithEveryColumn.issues,
    file.rows.length,
  ).filter((column) => column.wholeColumn);
  const fieldsToDrop = fieldsToLeaveOut(flaggedColumns);
  const planMapping = dropFields(mapping, fieldsToDrop);
  const rowsToImport =
    fieldsToDrop.length === 0
      ? rowsWithEveryColumn.rows
      : buildRows({
          headers: file.headers,
          rawRows: file.rows,
          rowNumbers: file.rowNumbers,
          mapping: planMapping,
          statusValues: chosenStatuses,
        }).rows;
  const importRows: StagedRow[] = rowsToImport.map((row, dataIndex) => ({
    ...row,
    raw: file.rows[dataIndex],
  }));
  const rowsByNumber = new Map(importRows.map((row) => [row.rowNumber, row]));
  const conflicts = findInFileConflicts(importRows.map(matchKeysOf));
  const repeatedRows = [...conflicts.entries()]
    .filter(([rowNumber]) => {
      const row = rowsByNumber.get(rowNumber);
      return Boolean(row?.manufacturer && row.product);
    })
    .map(([rowNumber, reason]) => ({ rowNumber, reason }));

  return {
    flaggedColumns,
    issueGroups: rowIssueGroups(rowsWithEveryColumn.issues, flaggedColumns),
    planMapping,
    importRows,
    conflicts,
    repeatedRows,
    rowsByNumber,
  };
};
