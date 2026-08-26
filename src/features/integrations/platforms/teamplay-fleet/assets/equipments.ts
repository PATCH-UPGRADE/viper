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
  vendorId: string;
  serialNumber: string | null;
  role: string | null;
  location: { facility?: string; building?: string };
  productName: string;
  softwareVersion: string | null;
}

const blank = (value: string | null | undefined): string | null =>
  value ? value : null;

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
    vendorId: raw.equipmentKey,
    serialNumber: serialNumberOf(raw.serialNumber),
    role: blank(raw.modalityTranslation),
    location: {
      ...(blank(raw.customerName)
        ? { facility: raw.customerName as string }
        : {}),
      ...(address ? { building: address } : {}),
    },
    productName: blank(raw.productName) ?? "Unknown Siemens device",
    softwareVersion: blank(raw.softwareVersion),
  };
}
