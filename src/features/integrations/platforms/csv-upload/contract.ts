import { z } from "zod";
import { AssetStatus, CsvImportStatus } from "@/generated/prisma";

export const ASSET_IMPORT_FIELDS = [
  "role",
  "manufacturer",
  "product",
  "version",
  "serialNumber",
  "ip",
  "macAddress",
  "hostname",
  "networkSegment",
  "status",
  "facility",
  "building",
  "floor",
  "room",
] as const;
export type AssetImportField = (typeof ASSET_IMPORT_FIELDS)[number];

export const CONSTANT_FIELDS = [
  "role",
  "manufacturer",
  "product",
  "version",
  "networkSegment",
  "status",
  "facility",
  "building",
  "floor",
  "room",
] as const satisfies readonly AssetImportField[];
export type ConstantField = (typeof CONSTANT_FIELDS)[number];

export const MAX_IMPORT_FILE_BYTES = 4 * 1024 * 1024;
export const MAX_REQUEST_BYTES = 2 * 1024 * 1024;
export const MAX_CELL_LENGTH = 256;
export const SAMPLE_ROW_COUNT = 5;
export const MAX_DISTINCT_VALUES = 50;
export const COLUMN_FLAG_THRESHOLD = 10;
export const SEE_LIST_PAGE_SIZE = 25;
export const MAX_PREVIEW_ROWS = 5000;
export const PREVIEW_REQUEST_BYTES = 450 * 1024;
export const CSV_IMPORT_EVENT = "csv-import/apply.requested" as const;
export const CSV_EXTERNAL_ID_PREFIX = "csv:";

export const normalizeNameKey = (name: string): string =>
  name.trim().toLowerCase();
export const productKey = (manufacturer: string, product: string): string =>
  `${normalizeNameKey(manufacturer)}::${normalizeNameKey(product)}`;
export const csvExternalId = (assetId: string): string =>
  `${CSV_EXTERNAL_ID_PREFIX}${assetId}`;

export const assetStatusSchema = z.enum(Object.values(AssetStatus));
export const csvImportStatusSchema = z.enum(Object.values(CsvImportStatus));
export const llmConfidenceSchema = z.enum(["Matched", "NeedsReview"]);
export type LlmConfidence = z.infer<typeof llmConfidenceSchema>;

export const fieldSourceSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("column"), header: z.string().min(1) }),
  z.object({
    kind: z.literal("constant"),
    value: z.string().trim().min(1).max(MAX_CELL_LENGTH),
  }),
]);
export type FieldSource = z.infer<typeof fieldSourceSchema>;

export const columnMappingSchema = z.partialRecord(
  z.enum(ASSET_IMPORT_FIELDS),
  fieldSourceSchema,
);
export type ColumnMapping = z.infer<typeof columnMappingSchema>;

export const statusValuesSchema = z.record(
  z.string(),
  assetStatusSchema.nullable(),
);
export type StatusValues = z.infer<typeof statusValuesSchema>;

export const suggestMappingInputSchema = z.object({
  headers: z.array(z.string().min(1).max(MAX_CELL_LENGTH)).min(1).max(200),
  sampleRows: z.array(z.record(z.string(), z.string())).max(SAMPLE_ROW_COUNT),
  distinctValues: z.record(
    z.string(),
    z.array(z.string().max(MAX_CELL_LENGTH)).max(MAX_DISTINCT_VALUES),
  ),
});
export const suggestMappingOutputSchema = z.object({
  fields: z.partialRecord(
    z.enum(ASSET_IMPORT_FIELDS),
    z.object({ header: z.string(), confidence: llmConfidenceSchema }),
  ),
  statusValues: z.array(
    z.object({
      value: z.string(),
      status: assetStatusSchema.nullable(),
      confidence: llmConfidenceSchema,
    }),
  ),
});
export type SuggestMappingOutput = z.infer<typeof suggestMappingOutputSchema>;

export const nameRefSchema = z.object({
  id: z.string(),
  displayName: z.string(),
});
export type NameRef = z.infer<typeof nameRefSchema>;

export const nameMatchSchema = z.object({
  name: z.string(),
  status: z.enum(["exact", "suggested", "new"]),
  match: nameRefSchema.nullable(),
  confidence: llmConfidenceSchema.nullable(),
  matchedByAlias: z.boolean(),
});
export type NameMatch = z.infer<typeof nameMatchSchema>;

const nameCell = z.string().trim().min(1).max(MAX_CELL_LENGTH);

export const matchNamesInputSchema = z.object({
  manufacturers: z.array(nameCell).max(500),
  products: z
    .array(z.object({ manufacturer: nameCell, product: nameCell }))
    .max(5000),
});
export type MatchNamesInput = z.infer<typeof matchNamesInputSchema>;
export const matchNamesOutputSchema = z.object({
  manufacturers: z.array(nameMatchSchema),
  products: z.array(nameMatchSchema.extend({ manufacturer: z.string() })),
});
export type MatchNamesOutput = z.infer<typeof matchNamesOutputSchema>;

export const searchNamesInputSchema = z.object({
  kind: z.enum(["manufacturer", "product"]),
  query: z.string().trim().min(1).max(100),
  manufacturerId: z.string().optional(),
});
export const searchNamesOutputSchema = z.array(nameRefSchema).max(20);

export const nameDecisionSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("existing"), id: z.string() }),
  z.object({ kind: z.literal("new") }),
]);
export type NameDecision = z.infer<typeof nameDecisionSchema>;

export const nameDecisionsSchema = z.object({
  manufacturers: z.record(z.string(), nameDecisionSchema),
  products: z.record(z.string(), nameDecisionSchema),
});
export type NameDecisions = z.infer<typeof nameDecisionsSchema>;

const cell = z.string().trim().min(1).max(MAX_CELL_LENGTH).nullable();

export const csvAssetRowSchema = z.object({
  rowNumber: z.number().int().min(2),
  role: cell,
  manufacturer: cell,
  product: cell,
  version: cell,
  serialNumber: cell,
  ip: cell,
  macAddress: cell,
  hostname: cell,
  networkSegment: cell,
  status: assetStatusSchema.nullable(),
  facility: cell,
  building: cell,
  floor: cell,
  room: cell,
});
export type CsvAssetRow = z.infer<typeof csvAssetRowSchema>;

export const stagedRowSchema = csvAssetRowSchema.extend({
  raw: z.array(z.string()),
});
export type StagedRow = z.infer<typeof stagedRowSchema>;

export const matchKeysRowSchema = csvAssetRowSchema.pick({
  rowNumber: true,
  manufacturer: true,
  product: true,
  serialNumber: true,
  macAddress: true,
  hostname: true,
});
export type MatchKeysRow = z.infer<typeof matchKeysRowSchema>;

export const rowOutcomeSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("add"), rowNumber: z.number().int() }),
  z.object({
    kind: z.literal("link"),
    rowNumber: z.number().int(),
    assetId: z.string(),
  }),
  z.object({
    kind: z.literal("fail"),
    rowNumber: z.number().int(),
    reason: z.string(),
  }),
]);
export type RowOutcome = z.infer<typeof rowOutcomeSchema>;

export const linkedAssetSchema = z.object({
  id: z.string(),
  label: z.string(),
  serialNumber: z.string().nullable(),
  platforms: z.array(z.string()),
});
export type LinkedAsset = z.infer<typeof linkedAssetSchema>;

export const previewInputSchema = z.object({
  rows: z.array(matchKeysRowSchema).min(1).max(MAX_PREVIEW_ROWS),
});
export const previewOutputSchema = z.object({
  outcomes: z.array(rowOutcomeSchema),
  linkedAssets: z.array(linkedAssetSchema),
});
export type PreviewOutput = z.infer<typeof previewOutputSchema>;

export const importPlanSchema = z.object({
  mapping: columnMappingSchema,
  statusValues: statusValuesSchema,
  nameDecisions: nameDecisionsSchema,
});
export type ImportPlan = z.infer<typeof importPlanSchema>;

export const createImportInputSchema = importPlanSchema.extend({
  sourceName: z.string().trim().max(100).optional(),
  fileName: z.string().min(1).max(255),
  headers: z.array(z.string()).min(1).max(200),
  rowCount: z.number().int().min(1),
});
export const createImportOutputSchema = z.object({
  importId: z.string(),
  integrationId: z.string(),
  sourceName: z.string(),
});

export const stageRowsInputSchema = z.object({
  importId: z.string(),
  chunkIndex: z.number().int().min(0),
  rows: z.array(stagedRowSchema).min(1),
});
export const startImportInputSchema = z.object({
  importId: z.string(),
  chunkCount: z.number().int().min(1),
});

export const importStatusSchema = z.object({
  importId: z.string(),
  integrationId: z.string(),
  sourceName: z.string(),
  fileName: z.string(),
  status: csvImportStatusSchema,
  totalRows: z.number().int(),
  addedCount: z.number().int(),
  linkedCount: z.number().int(),
  failedCount: z.number().int(),
  finishedAt: z.date().nullable(),
});
export type ImportStatus = z.infer<typeof importStatusSchema>;

export const importFailureSchema = z.object({
  rowNumber: z.number().int(),
  reason: z.string(),
});
export type ImportFailure = z.infer<typeof importFailureSchema>;

export const failuresInputSchema = z.object({
  importId: z.string(),
  page: z.number().int().min(1).default(1),
});
export const failuresOutputSchema = z.object({
  items: z.array(importFailureSchema.extend({ label: z.string() })),
  total: z.number().int(),
});
export const failuresCsvOutputSchema = z.object({
  fileName: z.string(),
  csv: z.string(),
});
