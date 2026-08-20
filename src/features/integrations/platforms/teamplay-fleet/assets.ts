import { z } from "zod";
import type { Cursor, Page, ResourceModule, Session } from "../../core/types";
import type { FleetConfig } from "./config";
import { EQUIPMENTS_URL } from "./urls";

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

export const assets: ResourceModule<
  FleetAssetItem,
  FleetEquipment,
  FleetConfig
> = {
  async *listChanged(
    session: Session,
    _cursor: Cursor | null,
  ): AsyncIterable<Page<FleetEquipment>> {
    const all = await fetchEquipments(session);
    // The endpoint has no pagination and no delta filter (probed 2026-08-19):
    // the whole inventory is one page and the cursor is permanently null.
    yield { items: all.filter((e) => e.isActive !== false), cursor: null };
  },

  async get(session: Session, externalId: string): Promise<FleetEquipment> {
    const all = await fetchEquipments(session);
    const found = all.find((e) => e.equipmentKey === externalId);
    if (!found) {
      throw new Error(`Fleet has no equipment ${externalId}`);
    }
    return found;
  },

  toCanonical(raw: FleetEquipment): FleetAssetItem {
    const address = [
      blank(raw.street),
      blank(raw.city),
      [blank(raw.state), blank(raw.zip)].filter(Boolean).join(" ") || null,
    ]
      .filter(Boolean)
      .join(", ");
    return {
      vendorId: raw.equipmentKey,
      serialNumber: blank(raw.serialNumber),
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
  },

  apiUrlFor: () => EQUIPMENTS_URL,

  defaultSyncEvery: 86400,
};
