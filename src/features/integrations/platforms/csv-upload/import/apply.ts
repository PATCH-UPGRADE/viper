import "server-only";
import { fillProductDeviceType } from "@/features/device-types/server/apply-device-type";
import { resolveDeviceType } from "@/features/device-types/server/resolve-device-type";
import { processIntegrationSync } from "@/features/integrations/core/sync/upsert";
import { type Prisma, ResourceType } from "@/generated/prisma";
import prisma from "@/lib/db";
import { resolveDeviceGroup } from "@/lib/router-utils";
import {
  addedAssetIdFor,
  CSV_UPLOAD_DISPLAY_NAME,
  csvExternalId,
  type ImportFailure,
  normalizeNameKey,
  productKey,
  type RowOutcome,
  type StagedRow,
} from "../contract";
import type { CanonicalNames } from "./context";
import type { ContextAsset, MatchContext } from "./match-rows";

const SCALAR_FIELDS = [
  "ip",
  "hostname",
  "macAddress",
  "serialNumber",
  "networkSegment",
  "status",
] as const;

const LOCATION_FIELDS = ["facility", "building", "floor", "room"] as const;

const SINGLE_ROW_FAILURE_PREFIX = "1 of 1 items failed: ";

type AssetFieldValues = Pick<
  Prisma.AssetUncheckedCreateInput,
  (typeof SCALAR_FIELDS)[number]
> & { location?: Prisma.InputJsonObject };

interface CsvSyncItem {
  externalId: string;
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

export const ROWS_BETWEEN_PROGRESS_REPORTS = 100;

export interface AppliedCounts {
  added: number;
  linked: number;
}

export interface ApplyChunkInput {
  importId: string;
  integrationId: string;
  userId: string;
  rows: StagedRow[];
  outcomes: RowOutcome[];
  context: MatchContext;
  canonicalNames: CanonicalNames;
  onProgress?: (appliedInChunk: AppliedCounts) => Promise<void>;
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

type FillDeviceType = (
  productId: string | null,
  row: StagedRow,
) => Promise<void>;

function prepareDeviceTypeFill(importId: string): FillDeviceType {
  const checkedProductTypes = new Set<string>();

  return async (productId, row) => {
    if (productId === null || row.deviceType === null) return;
    const productTypeKey = `${productId}::${normalizeNameKey(row.deviceType)}`;
    if (checkedProductTypes.has(productTypeKey)) return;
    checkedProductTypes.add(productTypeKey);

    const product = await prisma.product.findUnique({
      where: { id: productId },
      select: { deviceTypeId: true },
    });
    const productNeedsType = product !== null && product.deviceTypeId === null;
    if (!productNeedsType) return;

    const deviceType = await resolveDeviceType(row.deviceType, {
      integration: CSV_UPLOAD_DISPLAY_NAME,
      importId,
      rowNumber: row.rowNumber,
    });
    if (deviceType) await fillProductDeviceType(productId, deviceType.id);
  };
}

async function deviceGroupFor(
  row: StagedRow,
  canonicalNames: CanonicalNames,
): Promise<{ id: string; productId: string | null }> {
  if (row.manufacturer === null || row.product === null) {
    throw new Error("Manufacturer and model are required to add a device");
  }
  const manufacturer =
    canonicalNames.manufacturers.get(normalizeNameKey(row.manufacturer)) ??
    row.manufacturer;
  const product =
    canonicalNames.products.get(productKey(row.manufacturer, row.product)) ??
    row.product;
  return resolveDeviceGroup({
    manufacturer,
    product,
    version: row.version,
    hasCpe: false,
  });
}

async function toAssetWrite(
  item: CsvSyncItem,
  userId: string,
  input: ApplyChunkInput,
  fillDeviceType: FillDeviceType,
): Promise<AssetWrite> {
  if (item.kind === "add") {
    const deviceGroup = await deviceGroupFor(item.row, input.canonicalNames);
    await fillDeviceType(deviceGroup.productId, item.row);
    return {
      createData: {
        id: item.assetId,
        ...filledRowFields(item.row),
        deviceGroupId: deviceGroup.id,
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
  await fillDeviceType(matchedDevice.productId, item.row);
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
  fillDeviceType: FillDeviceType,
): Promise<string | null> {
  try {
    const response = await processIntegrationSync(
      prisma,
      {
        model: prisma.asset,
        mappingModel: prisma.externalAssetMapping,
        shouldRecordSyncOutcome: false,
        transformInputItem: (syncItem: CsvSyncItem, userId: string) =>
          toAssetWrite(syncItem, userId, input, fillDeviceType),
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
  const fillDeviceType = prepareDeviceTypeFill(input.importId);

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
      outcome.kind === "add"
        ? addedAssetIdFor(input.importId, row.rowNumber)
        : outcome.assetId;
    const item: CsvSyncItem = {
      externalId: csvExternalId(assetId),
      assetId,
      kind: outcome.kind,
      row,
    };

    const failureReason = await writeRow(item, input, fillDeviceType);
    if (failureReason !== null) {
      result.failures.push({ rowNumber: row.rowNumber, reason: failureReason });
      continue;
    }
    if (outcome.kind === "add") {
      result.added++;
    } else {
      result.linked++;
    }

    const appliedInChunk = result.added + result.linked;
    const isTimeToReport = appliedInChunk % ROWS_BETWEEN_PROGRESS_REPORTS === 0;
    if (isTimeToReport) {
      await input.onProgress?.({ added: result.added, linked: result.linked });
    }
  }

  return result;
}
