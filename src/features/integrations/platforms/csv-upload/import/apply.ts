import "server-only";
import { processIntegrationSync } from "@/features/integrations/core/sync/upsert";
import { type Prisma, ResourceType } from "@/generated/prisma";
import prisma from "@/lib/db";
import { resolveDeviceGroup } from "@/lib/router-utils";
import {
  csvExternalId,
  type ImportFailure,
  normalizeNameKey,
  productKey,
  type RowOutcome,
  type StagedRow,
} from "../contract";
import type { CanonicalNames } from "./context";
import type { ContextAsset, MatchContext } from "./plan";

const SCALAR_FIELDS = [
  "ip",
  "hostname",
  "macAddress",
  "serialNumber",
  "networkSegment",
  "role",
  "status",
] as const;

const LOCATION_FIELDS = ["facility", "building", "floor", "room"] as const;

const SINGLE_ROW_FAILURE_PREFIX = "1 of 1 items failed: ";

type AssetFieldValues = Pick<
  Prisma.AssetUncheckedCreateInput,
  (typeof SCALAR_FIELDS)[number]
> & { location?: Prisma.InputJsonObject };

interface CsvSyncItem {
  vendorId: string;
  assetId: string;
  kind: "add" | "link";
  row: StagedRow;
}

interface AssetWrite {
  createData: Partial<Prisma.AssetUncheckedCreateInput>;
  updateData: Prisma.AssetUncheckedUpdateInput;
  uniqueFieldConditions: Array<{ id: string }>;
  artifactsData: undefined;
}

export interface ApplyChunkInput {
  integrationId: string;
  userId: string;
  rows: StagedRow[];
  outcomes: RowOutcome[];
  context: MatchContext;
  canonicalNames: CanonicalNames;
}

export interface ChunkResult {
  added: number;
  linked: number;
  failures: ImportFailure[];
}

const isFilled = (value: unknown): boolean =>
  typeof value === "string" ? value.trim() !== "" : value != null;

function filledRowFields(row: StagedRow): AssetFieldValues {
  const fields: AssetFieldValues = {};
  for (const field of SCALAR_FIELDS) {
    const value = row[field];
    if (value !== null) Object.assign(fields, { [field]: value });
  }
  const location: Record<string, string> = {};
  for (const field of LOCATION_FIELDS) {
    const value = row[field];
    if (value !== null) location[field] = value;
  }
  if (Object.keys(location).length > 0) fields.location = location;
  return fields;
}

function fieldsMissingFromDevice(
  row: StagedRow,
  matchedDevice: ContextAsset,
): AssetFieldValues {
  const fields: AssetFieldValues = {};
  for (const field of SCALAR_FIELDS) {
    const value = row[field];
    if (value !== null && !isFilled(matchedDevice[field])) {
      Object.assign(fields, { [field]: value });
    }
  }
  const storedLocation = matchedDevice.location ?? {};
  const missingLocationParts: Record<string, string> = {};
  for (const field of LOCATION_FIELDS) {
    const value = row[field];
    if (value !== null && !isFilled(storedLocation[field])) {
      missingLocationParts[field] = value;
    }
  }
  if (Object.keys(missingLocationParts).length > 0) {
    fields.location = {
      ...(storedLocation as Prisma.InputJsonObject),
      ...missingLocationParts,
    };
  }
  return fields;
}

async function deviceGroupIdFor(
  row: StagedRow,
  canonicalNames: CanonicalNames,
): Promise<string> {
  if (row.manufacturer === null || row.product === null) {
    throw new Error("Manufacturer and model are required to add a device");
  }
  const manufacturer =
    canonicalNames.manufacturers.get(normalizeNameKey(row.manufacturer)) ??
    row.manufacturer;
  const product =
    canonicalNames.products.get(productKey(row.manufacturer, row.product)) ??
    row.product;
  const deviceGroup = await resolveDeviceGroup({
    manufacturer,
    product,
    version: row.version,
    hasCpe: false,
  });
  return deviceGroup.id;
}

async function toAssetWrite(
  item: CsvSyncItem,
  userId: string,
  input: ApplyChunkInput,
): Promise<AssetWrite> {
  if (item.kind === "add") {
    const deviceGroupId = await deviceGroupIdFor(
      item.row,
      input.canonicalNames,
    );
    return {
      createData: {
        id: item.assetId,
        ...filledRowFields(item.row),
        deviceGroupId,
        userId,
      },
      updateData: {},
      uniqueFieldConditions: [],
      artifactsData: undefined,
    };
  }

  const matchedDevice = input.context.assets.get(item.assetId);
  if (!matchedDevice) {
    throw new Error("The matched device is no longer in VIPER");
  }
  return {
    createData: {},
    updateData: fieldsMissingFromDevice(item.row, matchedDevice),
    uniqueFieldConditions: [{ id: item.assetId }],
    artifactsData: undefined,
  };
}

async function writeRow(
  item: CsvSyncItem,
  input: ApplyChunkInput,
): Promise<string | null> {
  try {
    const response = await processIntegrationSync(
      prisma,
      {
        model: prisma.asset,
        mappingModel: prisma.externalAssetMapping,
        shouldRecordSyncOutcome: false,
        transformInputItem: (syncItem: CsvSyncItem, userId: string) =>
          toAssetWrite(syncItem, userId, input),
      },
      { items: [item] },
      input.userId,
      input.integrationId,
      ResourceType.Asset,
    );
    if (!response.shouldRetry) return null;
    return response.message.replace(SINGLE_ROW_FAILURE_PREFIX, "");
  } catch (error) {
    console.error("Failed to apply CSV row:", error);
    return error instanceof Error ? error.message : "Unknown error";
  }
}

export async function applyChunk(input: ApplyChunkInput): Promise<ChunkResult> {
  const outcomeByRowNumber = new Map(
    input.outcomes.map((outcome) => [outcome.rowNumber, outcome]),
  );
  const result: ChunkResult = { added: 0, linked: 0, failures: [] };

  for (const row of input.rows) {
    const outcome = outcomeByRowNumber.get(row.rowNumber);
    if (!outcome) {
      throw new Error(`Row ${row.rowNumber} has no planned outcome`);
    }
    if (outcome.kind === "fail") {
      result.failures.push({
        rowNumber: row.rowNumber,
        reason: outcome.reason,
      });
      continue;
    }

    const assetId =
      outcome.kind === "add" ? crypto.randomUUID() : outcome.assetId;
    const item: CsvSyncItem = {
      vendorId: csvExternalId(assetId),
      assetId,
      kind: outcome.kind,
      row,
    };

    const failureReason = await writeRow(item, input);
    if (failureReason !== null) {
      result.failures.push({ rowNumber: row.rowNumber, reason: failureReason });
    } else if (outcome.kind === "add") {
      result.added++;
    } else {
      result.linked++;
    }
  }

  return result;
}
