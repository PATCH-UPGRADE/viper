import { z } from "zod";
import type { Cursor, Page, Session } from "../../../core/types";
import { EQUIPMENTS_URL } from "../urls";

// used by index.ts and sync.ts, in a separate file to avoid a loop

// Permissive view of a Fleet /rest/v1/equipments record. Only fields we consume
// are declared; unknown fields are stripped.
const fleetEquipmentSchema = z.object({
  equipmentKey: z.string(),
  serialNumber: z.string().nullish(),
  productName: z.string().nullish(),
  materialNumber: z.union([z.string(), z.number()]).nullish(),
  modalityCode: z.union([z.string(), z.number()]).nullish(),
  modalityTranslation: z.string().nullish(),
  softwareVersion: z.string().nullish(),
  customerName: z.string().nullish(),
  street: z.string().nullish(),
  city: z.string().nullish(),
  state: z.string().nullish(),
  zip: z.string().nullish(),
  isActive: z.boolean().nullish(),
});

export type FleetEquipment = z.infer<typeof fleetEquipmentSchema>;

export interface FleetAssetItem {
  externalId: string;
  serialNumber: string | null;
  /**
   * Fleet's modality label, for example "Computed Tomography (CT)". It
   * describes the product, so it feeds the product's device type and never
   * Asset.role.
   */
  modality: string | null;
  location: { facility?: string; building?: string };
  productName: string;
  softwareVersion: string | null;
  materialNumber: string | null;
  modalityCode: string | null;
}

/** The shared product for every Fleet record with no productName. */
export const UNKNOWN_FLEET_PRODUCT = "Unknown Siemens device";

const blank = (value: string | null | undefined): string | null =>
  value ? value : null;

const code = (value: string | number | null | undefined): string | null =>
  value == null ? null : blank(String(value));

// Fleet records carry placeholders in the serial field. Treating them as real
// would match every placeholder-carrying machine onto one asset.
const PLACEHOLDER_SERIALS = new Set(["n/a", "na", "none", "unknown", "-", "0"]);

const serialNumberOf = (raw: string | null | undefined): string | null => {
  const trimmed = raw?.trim();
  if (!trimmed || PLACEHOLDER_SERIALS.has(trimmed.toLowerCase())) return null;
  return trimmed;
};

async function fetchEquipments(session: Session): Promise<FleetEquipment[]> {
  const res = await session.request(EQUIPMENTS_URL);
  if (!res.ok) {
    throw new Error(`Fleet /equipments returned ${res.status}`);
  }
  return z.array(fleetEquipmentSchema).parse(await res.json());
}

export function computeWeakSerials(items: FleetAssetItem[]): Set<string> {
  const seen = new Set<string>();
  const weak = new Set<string>();
  for (const item of items) {
    if (!item.serialNumber) continue;
    if (seen.has(item.serialNumber)) weak.add(item.serialNumber);
    seen.add(item.serialNumber);
  }
  return weak;
}

export async function* listChanged(
  session: Session,
  _cursor: Cursor | null,
): AsyncIterable<Page<FleetEquipment>> {
  const all = await fetchEquipments(session);
  // Fleet's /equipments cannot paginate or filter by change; every sync is the full inventory.
  yield { items: all.filter((e) => e.isActive !== false), cursor: null };
}

export async function get(
  session: Session,
  externalId: string,
): Promise<FleetEquipment> {
  const all = await fetchEquipments(session);
  const found = all.find((e) => e.equipmentKey === externalId);
  if (!found) {
    throw new Error(`Fleet has no equipment ${externalId}`);
  }
  return found;
}

export function toCanonical(raw: FleetEquipment): FleetAssetItem {
  const address = [
    blank(raw.street),
    blank(raw.city),
    [blank(raw.state), blank(raw.zip)].filter(Boolean).join(" ") || null,
  ]
    .filter(Boolean)
    .join(", ");
  return {
    externalId: raw.equipmentKey,
    serialNumber: serialNumberOf(raw.serialNumber),
    modality: blank(raw.modalityTranslation),
    location: {
      ...(blank(raw.customerName)
        ? { facility: raw.customerName as string }
        : {}),
      ...(address ? { building: address } : {}),
    },
    productName: blank(raw.productName) ?? UNKNOWN_FLEET_PRODUCT,
    softwareVersion: blank(raw.softwareVersion),
    materialNumber: code(raw.materialNumber),
    modalityCode: code(raw.modalityCode),
  };
}
