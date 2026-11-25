import "server-only";
import { fillProductDeviceType } from "@/features/device-types/server/apply-device-type";
import { resolveDeviceType } from "@/features/device-types/server/resolve-device-type";
import type { TrackedWrite } from "@/features/integrations/core/sync/stores";
import { processIntegrationSync } from "@/features/integrations/core/sync/upsert";
import { type Prisma, ResourceType } from "@/generated/prisma";
import prisma from "@/lib/db";
import { type ResolvedDevice, resolveDevice } from "@/lib/router-utils";
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

const TRACKED_FIELDS = [
  "ip",
  "hostname",
  "macAddress",
  "serialNumber",
] as const;

const IGNORED_FIELDS = ["networkSegment", "status"] as const;

const LOCATION_FIELDS = ["facility", "building", "floor", "room"] as const;

const SINGLE_ROW_FAILURE_PREFIX = "1 of 1 items failed: ";

interface CsvSyncItem {
  externalId: string;
  assetId: string;
  kind: "add" | "link";
  row: StagedRow;
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
  /** When the file was received. Every row gets this time. */
  observedAt: Date;
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

type RowValues = Partial<
  Pick<
    StagedRow,
    (typeof TRACKED_FIELDS)[number] | (typeof IGNORED_FIELDS)[number]
  >
>;

/** The values of the row in these fields, without its empty cells. */
function filledValues(
  row: StagedRow,
  fields: ReadonlyArray<keyof RowValues>,
): RowValues {
  const filled = fields.filter((field) => row[field] !== null);
  return Object.fromEntries(filled.map((field) => [field, row[field]]));
}

function rowLocation(row: StagedRow): Record<string, string> {
  const location: Record<string, string> = {};
  for (const field of LOCATION_FIELDS) {
    const value = row[field];
    if (value !== null) location[field] = value;
  }
  return location;
}

/** The tracked fields that the row states. */
function statedFields(row: StagedRow, device: ResolvedDevice | null) {
  const location = rowLocation(row);
  const fields = {
    ...filledValues(row, TRACKED_FIELDS),
    location: Object.keys(location).length > 0 ? location : undefined,
  };
  return device ? { ...fields, ...device } : fields;
}

/**
 * An update of a device that the row matched. The whole row is recorded, and
 * only what the device doesn't have yet is applied.
 */
function fillMissing(
  row: StagedRow,
  device: ResolvedDevice | null,
  matchedDevice: ContextAsset,
): TrackedWrite<"ASSET">["update"] {
  const isMissing = (field: keyof RowValues) =>
    row[field] !== null && !isFilled(matchedDevice[field]);

  const storedLocation = matchedDevice.location ?? {};
  const missingLocationParts = Object.entries(rowLocation(row)).filter(
    ([field]) => !isFilled(storedLocation[field]),
  );
  const isLocationMissing = missingLocationParts.length > 0;

  return {
    fields: {
      ...statedFields(row, device),
      // An ignored field is always written, so state only a missing one.
      ...filledValues(row, IGNORED_FIELDS.filter(isMissing)),
    },
    apply: [
      ...TRACKED_FIELDS.filter(isMissing),
      ...(isLocationMissing ? (["location"] as const) : []),
    ],
    applyAs: isLocationMissing
      ? {
          location: {
            ...(storedLocation as Prisma.InputJsonObject),
            ...Object.fromEntries(missingLocationParts),
          },
        }
      : undefined,
  };
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

/** The device that the row names, or null if it has no manufacturer or model. */
async function deviceFor(
  row: StagedRow,
  canonicalNames: CanonicalNames,
): Promise<ResolvedDevice | null> {
  if (row.manufacturer === null || row.product === null) return null;
  const manufacturer =
    canonicalNames.manufacturers.get(normalizeNameKey(row.manufacturer)) ??
    row.manufacturer;
  const product =
    canonicalNames.products.get(productKey(row.manufacturer, row.product)) ??
    row.product;
  return resolveDevice({ manufacturer, product, version: row.version });
}

async function toAssetWrite(
  item: CsvSyncItem,
  input: ApplyChunkInput,
  fillDeviceType: FillDeviceType,
): Promise<TrackedWrite<"ASSET">> {
  const { row } = item;
  if (item.kind === "add") {
    const device = await deviceFor(row, input.canonicalNames);
    if (!device) {
      throw new Error("Manufacturer and model are required to add a device");
    }
    await fillDeviceType(device.productId, row);
    const fields = statedFields(row, device);
    return {
      create: {
        fields: { ...fields, ...filledValues(row, IGNORED_FIELDS) },
        only: { id: item.assetId },
      },
      // Only a retry of this import finds the device that it added.
      update: { fields, apply: [] },
      uniqueFieldConditions: [],
    };
  }

  const matchedDevice = input.context.assets.get(item.assetId);
  if (!matchedDevice) {
    throw new Error("The matched device is no longer in VIPER");
  }
  await fillDeviceType(matchedDevice.productId, row);
  const device = await deviceFor(row, input.canonicalNames);
  return {
    create: null,
    update: fillMissing(row, device, matchedDevice),
    uniqueFieldConditions: [{ id: item.assetId }],
  };
}

async function writeRow(
  item: CsvSyncItem,
  input: ApplyChunkInput,
  fillDeviceType: FillDeviceType,
): Promise<string | null> {
  try {
    const response = await processIntegrationSync(
      {
        entityType: "ASSET",
        shouldRecordSyncOutcome: false,
        transformInputItem: (syncItem: CsvSyncItem) =>
          toAssetWrite(syncItem, input, fillDeviceType),
      },
      { items: [item] },
      {
        integrationId: input.integrationId,
        observedAt: input.observedAt,
        actorUserId: input.userId,
        // Each import is its own integration, so its own name would show once
        // the import is removed and its platform is unknown.
        integrationName: CSV_UPLOAD_DISPLAY_NAME,
      },
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
