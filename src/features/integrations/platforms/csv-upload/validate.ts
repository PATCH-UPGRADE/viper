import {
  ASSET_IMPORT_FIELDS,
  type AssetImportField,
  COLUMN_FLAG_THRESHOLD,
} from "./contract";

export type RowIssueKind = "invalidIp" | "invalidMac" | "tooLong" | "missing";

export interface RowIssue {
  rowNumber: number;
  field: AssetImportField;
  kind: RowIssueKind;
  value: string;
}

export interface ColumnIssue {
  field: AssetImportField;
  failedCount: number;
  totalRows: number;
  wholeColumn: boolean;
  issues: RowIssue[];
}

const IPV4_OCTET = "(25[0-5]|2[0-4]\\d|1\\d\\d|[1-9]?\\d)";
const IPV4 = new RegExp(`^${IPV4_OCTET}(\\.${IPV4_OCTET}){3}$`);
const IPV6_GROUP = /^[0-9a-f]{1,4}$/i;
const MAC = /^[0-9a-f]{2}([:-])[0-9a-f]{2}(\1[0-9a-f]{2}){4}$/i;
const IPV6_GROUP_COUNT = 8;

const isBasicIpv6 = (value: string): boolean => {
  const halves = value.split("::");
  if (halves.length > 2) return false;
  const isCompressed = halves.length === 2;
  const groups = halves.flatMap((half) => (half === "" ? [] : half.split(":")));
  const groupCountFits = isCompressed
    ? groups.length < IPV6_GROUP_COUNT
    : groups.length === IPV6_GROUP_COUNT;
  return groupCountFits && groups.every((group) => IPV6_GROUP.test(group));
};

export const isValidIp = (value: string): boolean =>
  IPV4.test(value) || isBasicIpv6(value);

export const isValidMac = (value: string): boolean => MAC.test(value);

export function columnIssues(
  issues: RowIssue[],
  totalRows: number,
): ColumnIssue[] {
  const issuesByField = new Map<AssetImportField, RowIssue[]>();
  for (const issue of issues) {
    const fieldIssues = issuesByField.get(issue.field) ?? [];
    fieldIssues.push(issue);
    issuesByField.set(issue.field, fieldIssues);
  }

  const fieldsWithIssues = ASSET_IMPORT_FIELDS.filter((field) =>
    issuesByField.has(field),
  );
  return fieldsWithIssues.map((field) => {
    const fieldIssues = issuesByField.get(field) ?? [];
    return {
      field,
      failedCount: fieldIssues.length,
      totalRows,
      wholeColumn: fieldIssues.length > COLUMN_FLAG_THRESHOLD,
      issues: fieldIssues,
    };
  });
}
