import type { AssetStatus } from "@/generated/prisma";
import {
  ASSET_IMPORT_FIELDS,
  type AssetImportField,
  type ColumnMapping,
  type LlmConfidence,
  MAX_DISTINCT_VALUES,
  type StatusValues,
  type SuggestMappingOutput,
} from "../contract";
import { REQUIRED_FIELDS } from "../rows";

export type RequiredField = (typeof REQUIRED_FIELDS)[number];

export type FieldConfidence = Partial<Record<AssetImportField, LlmConfidence>>;

export interface ColumnSuggestion {
  mapping: ColumnMapping;
  fieldConfidence: FieldConfidence;
  statusValues: StatusValues;
  statusConfidence: Record<string, LlmConfidence>;
}

export interface StatusValueRow {
  value: string;
  rowCount: number;
  status: AssetStatus | null;
  confidence: LlmConfidence;
  picked: boolean;
  needsPick: boolean;
}

export const columnSuggestionFrom = (
  suggestion: SuggestMappingOutput,
  headers: string[],
): ColumnSuggestion => {
  const headersInFile = new Set(headers);
  const suggestedFields = ASSET_IMPORT_FIELDS.flatMap((field) => {
    const suggested = suggestion.fields[field];
    return suggested && headersInFile.has(suggested.header)
      ? [{ field, ...suggested }]
      : [];
  });
  return {
    mapping: Object.fromEntries(
      suggestedFields.map(({ field, header }) => [
        field,
        { kind: "column", header },
      ]),
    ),
    fieldConfidence: Object.fromEntries(
      suggestedFields.map(({ field, confidence }) => [field, confidence]),
    ),
    statusValues: Object.fromEntries(
      suggestion.statusValues.map(({ value, status }) => [value, status]),
    ),
    statusConfidence: Object.fromEntries(
      suggestion.statusValues.map(({ value, confidence }) => [
        value,
        confidence,
      ]),
    ),
  };
};

export const fieldForHeader = (
  mapping: ColumnMapping,
  header: string,
): AssetImportField | null =>
  ASSET_IMPORT_FIELDS.find((field) => {
    const source = mapping[field];
    return source?.kind === "column" && source.header === header;
  }) ?? null;

const mappingWithout = (
  mapping: ColumnMapping,
  isRemoved: (field: AssetImportField) => boolean,
): ColumnMapping =>
  Object.fromEntries(
    ASSET_IMPORT_FIELDS.filter(
      (field) => mapping[field] !== undefined && !isRemoved(field),
    ).map((field) => [field, mapping[field]]),
  );

export const assignColumn = (
  mapping: ColumnMapping,
  header: string,
  field: AssetImportField | null,
): ColumnMapping => {
  const mappingFreeOfHeader = mappingWithout(mapping, (candidate) => {
    const source = mapping[candidate];
    return source?.kind === "column" && source.header === header;
  });
  if (!field) return mappingFreeOfHeader;
  return { ...mappingFreeOfHeader, [field]: { kind: "column", header } };
};

export const setConstant = (
  mapping: ColumnMapping,
  field: AssetImportField,
  value: string,
): ColumnMapping => {
  const mappingWithoutField = mappingWithout(
    mapping,
    (candidate) => candidate === field,
  );
  if (!value.trim()) return mappingWithoutField;
  return { ...mappingWithoutField, [field]: { kind: "constant", value } };
};

export const dropFields = (
  mapping: ColumnMapping,
  fields: AssetImportField[],
): ColumnMapping => mappingWithout(mapping, (field) => fields.includes(field));

export const statusValueRows = (
  rowCountsByValue: Map<string, number>,
  chosenStatuses: StatusValues,
  statusConfidence: Record<string, LlmConfidence>,
  pickedValues: ReadonlySet<string>,
): StatusValueRow[] =>
  [...rowCountsByValue.entries()]
    .sort(([, fewerRows], [, moreRows]) => moreRows - fewerRows)
    .slice(0, MAX_DISTINCT_VALUES)
    .map(([value, rowCount]) => {
      const confidence = statusConfidence[value] ?? "NeedsReview";
      const picked = pickedValues.has(value);
      return {
        value,
        rowCount,
        status: chosenStatuses[value] ?? null,
        confidence,
        picked,
        needsPick: confidence === "NeedsReview" && !picked,
      };
    });

export const requiredFieldsNotSet = (mapping: ColumnMapping): RequiredField[] =>
  REQUIRED_FIELDS.filter((field) => mapping[field] === undefined);

export const requiredFieldsWithoutColumn = (
  mapping: ColumnMapping,
): RequiredField[] =>
  REQUIRED_FIELDS.filter((field) => mapping[field]?.kind !== "column");

export const columnsToConfirm = (
  mapping: ColumnMapping,
  fieldConfidence: FieldConfidence,
  confirmedFields: ReadonlySet<AssetImportField>,
): AssetImportField[] =>
  ASSET_IMPORT_FIELDS.filter(
    (field) =>
      mapping[field]?.kind === "column" &&
      fieldConfidence[field] === "NeedsReview" &&
      !confirmedFields.has(field),
  );

export const columnsToCheck = (
  mapping: ColumnMapping,
  fieldConfidence: FieldConfidence,
  confirmedFields: ReadonlySet<AssetImportField>,
  statusRows: StatusValueRow[],
): AssetImportField[] => {
  const fieldsToConfirm = columnsToConfirm(
    mapping,
    fieldConfidence,
    confirmedFields,
  );
  return ASSET_IMPORT_FIELDS.filter((field) => {
    if (mapping[field]?.kind !== "column") return false;
    const statusValuesNeedPick =
      field === "status" && statusRows.some((row) => row.needsPick);
    return fieldsToConfirm.includes(field) || statusValuesNeedPick;
  });
};
