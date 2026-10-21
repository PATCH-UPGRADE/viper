import {
  ASSET_IMPORT_FIELDS,
  type AssetImportField,
  MAX_CELL_LENGTH,
} from "../contract";
import {
  type ColumnIssue,
  isValidIp,
  isValidMac,
  type RowIssue,
  type RowIssueKind,
} from "../validate";
import { fieldNameInSentence, withArticle } from "./labels";

export interface IssueGroup {
  field: AssetImportField;
  kind: RowIssueKind;
  issues: RowIssue[];
}

export const INVALID_VALUE_KINDS: RowIssueKind[] = ["invalidIp", "invalidMac"];

export const dominantKind = (column: ColumnIssue): RowIssueKind => {
  const issuesByKind = new Map<RowIssueKind, number>();
  for (const issue of column.issues) {
    issuesByKind.set(issue.kind, (issuesByKind.get(issue.kind) ?? 0) + 1);
  }
  const [mostCommonKind] = [...issuesByKind.entries()].sort(
    ([, fewer], [, more]) => more - fewer,
  )[0];
  return mostCommonKind;
};

export const fieldsToLeaveOut = (
  flaggedColumns: ColumnIssue[],
): AssetImportField[] =>
  flaggedColumns
    .filter((column) => INVALID_VALUE_KINDS.includes(dominantKind(column)))
    .map((column) => column.field);

export type IssueChoice = "continue" | "stop";

export const REPEATED_ROWS_ISSUE_KEY = "repeatedRows";

export const columnIssueKey = (column: ColumnIssue): string =>
  `column:${column.field}`;

export const groupIssueKey = (group: IssueGroup): string =>
  `rows:${group.field}:${group.kind}`;

export const issueKeysFor = (
  flaggedColumns: ColumnIssue[],
  groups: IssueGroup[],
  repeatedRowCount: number,
): string[] => {
  const issueKeys = [
    ...flaggedColumns.map(columnIssueKey),
    ...groups.map(groupIssueKey),
  ];
  if (repeatedRowCount > 0) issueKeys.push(REPEATED_ROWS_ISSUE_KEY);
  return issueKeys;
};

export const problemWithValue = (
  kind: RowIssueKind,
  field: AssetImportField,
  value: string,
): string | null => {
  const typedValue = value.trim();
  if (typedValue.length > MAX_CELL_LENGTH) {
    return `${typedValue.length} characters. Shorten it to ${MAX_CELL_LENGTH} or fewer.`;
  }
  if (kind === "missing" && typedValue === "") {
    return `Type ${withArticle(fieldNameInSentence(field))}.`;
  }
  if (kind === "invalidIp" && typedValue !== "" && !isValidIp(typedValue)) {
    return "Not a valid IP address. Use a form like 10.20.4.15, or leave it empty.";
  }
  if (kind === "invalidMac" && typedValue !== "" && !isValidMac(typedValue)) {
    return "Not a valid MAC address. Use a form like 00:1A:2B:3C:4D:5E, or leave it empty.";
  }
  return null;
};

export interface EditedRows {
  field: AssetImportField;
  kind: RowIssueKind;
  rowNumbers: number[];
}

export interface IssueCardRows {
  key: string;
  field: AssetImportField;
  kind: RowIssueKind;
  openIssues: RowIssue[];
  fixedRowNumbers: number[];
}

export const rememberEditedRow = (
  editedRowsByKey: Record<string, EditedRows>,
  group: Pick<IssueGroup, "field" | "kind">,
  rowNumber: number,
): Record<string, EditedRows> => {
  const key = `rows:${group.field}:${group.kind}`;
  const rowNumbersSoFar = editedRowsByKey[key]?.rowNumbers ?? [];
  if (rowNumbersSoFar.includes(rowNumber)) return editedRowsByKey;
  return {
    ...editedRowsByKey,
    [key]: {
      field: group.field,
      kind: group.kind,
      rowNumbers: [...rowNumbersSoFar, rowNumber],
    },
  };
};

export const issueCardsFor = (
  groups: IssueGroup[],
  editedRowsByKey: Record<string, EditedRows>,
): IssueCardRows[] => {
  const cards: IssueCardRows[] = groups.map((group) => {
    const key = groupIssueKey(group);
    const openRowNumbers = new Set(
      group.issues.map((issue) => issue.rowNumber),
    );
    const editedRowNumbers = editedRowsByKey[key]?.rowNumbers ?? [];
    return {
      key,
      field: group.field,
      kind: group.kind,
      openIssues: group.issues,
      fixedRowNumbers: editedRowNumbers.filter(
        (rowNumber) => !openRowNumbers.has(rowNumber),
      ),
    };
  });
  const keysWithOpenIssues = new Set(cards.map((card) => card.key));
  for (const [key, editedRows] of Object.entries(editedRowsByKey)) {
    if (keysWithOpenIssues.has(key)) continue;
    cards.push({
      key,
      field: editedRows.field,
      kind: editedRows.kind,
      openIssues: [],
      fixedRowNumbers: editedRows.rowNumbers,
    });
  }
  return cards.sort(
    (first, second) =>
      ASSET_IMPORT_FIELDS.indexOf(first.field) -
      ASSET_IMPORT_FIELDS.indexOf(second.field),
  );
};

export const rowIssueGroups = (
  issues: RowIssue[],
  flaggedColumns: ColumnIssue[],
): IssueGroup[] => {
  const fieldsFlaggedWhole = new Set(
    flaggedColumns.map((column) => column.field),
  );
  const issuesByGroup = new Map<string, IssueGroup>();
  for (const issue of issues) {
    if (fieldsFlaggedWhole.has(issue.field)) continue;
    const key = `${issue.field}:${issue.kind}`;
    const group = issuesByGroup.get(key) ?? {
      field: issue.field,
      kind: issue.kind,
      issues: [],
    };
    group.issues.push(issue);
    issuesByGroup.set(key, group);
  }
  return [...issuesByGroup.values()].sort(
    (first, second) =>
      ASSET_IMPORT_FIELDS.indexOf(first.field) -
      ASSET_IMPORT_FIELDS.indexOf(second.field),
  );
};
