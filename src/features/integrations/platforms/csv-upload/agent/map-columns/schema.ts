import { z } from "zod";
import {
  ASSET_IMPORT_FIELDS,
  type AssetImportField,
  llmConfidenceSchema,
  type SuggestMappingOutput,
} from "../../contract";
import { FIELD_GUIDE } from "./context";

const IDENTITY_FIELDS: readonly AssetImportField[] = [
  "manufacturer",
  "product",
  "serialNumber",
  "macAddress",
  "hostname",
];

export function buildColumnMappingSchema(headers: string[]) {
  const offeredHeaders = [...new Set(headers)] as [string, ...string[]];
  const fieldGuess = z.object({
    header: z.enum(offeredHeaders).nullable(),
    confidence: llmConfidenceSchema,
  });
  const fieldsShape = Object.fromEntries(
    ASSET_IMPORT_FIELDS.map((field) => [
      field,
      fieldGuess.describe(
        `${FIELD_GUIDE[field].meaning} header: the column that holds it, or null when no column does.`,
      ),
    ]),
  ) as Record<AssetImportField, typeof fieldGuess>;

  return z.object({ fields: z.object(fieldsShape) });
}

export type ColumnMappingGuess = z.infer<
  ReturnType<typeof buildColumnMappingSchema>
>;

export type SuggestedFields = SuggestMappingOutput["fields"];

export function toSuggestedFields(guess: ColumnMappingGuess): SuggestedFields {
  const identityFieldsByHeader = new Map<string, AssetImportField[]>();
  for (const field of IDENTITY_FIELDS) {
    const { header } = guess.fields[field];
    if (header === null) continue;
    const fieldsOnHeader = identityFieldsByHeader.get(header) ?? [];
    identityFieldsByHeader.set(header, [...fieldsOnHeader, field]);
  }
  const identityFieldsSharingAHeader = new Set<AssetImportField>(
    [...identityFieldsByHeader.values()]
      .filter((fieldsOnHeader) => fieldsOnHeader.length > 1)
      .flat(),
  );

  const suggested: SuggestedFields = {};
  for (const field of ASSET_IMPORT_FIELDS) {
    const { header, confidence } = guess.fields[field];
    if (header === null || identityFieldsSharingAHeader.has(field)) continue;
    suggested[field] = { header, confidence };
  }
  return suggested;
}
