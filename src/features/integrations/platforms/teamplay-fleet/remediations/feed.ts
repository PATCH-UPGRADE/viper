import { z } from "zod";
import type { Session } from "@/features/integrations/core/types";
import type { ReleaseScalars } from "@/features/remediations/release";
import { RemediationCategory, type VersionStatus } from "@/generated/prisma";
import { systemUpdatesUrl, updateCvesUrl } from "../urls";
import { buildText } from "../utils";

const fleetSystemUpdateSchema = z.object({
  number: z.string(),
  title: z.string().nullish(),
  softwareVersion: z.string().nullish(),
  statusModel: z.object({ typeStatus: z.string().nullish() }).nullish(),
});

export type FleetSystemUpdate = z.infer<typeof fleetSystemUpdateSchema>;

const updateCvesSchema = z.object({
  cves: z.array(z.object({ text: z.string() })).nullish(),
});

export interface FleetDevice {
  manufacturerId: string | null;
  productId: string | null;
  versionId: string | null;
  versionStatus: VersionStatus;
}
export interface FleetRemediationItem {
  externalId: string;
  description: string;
  narrative: string | null;
  release: ReleaseScalars;
  devices: FleetDevice[];
  cveIds: string[];
}

/** Fleet's typeStatus names how the update is delievered */
const FLEET_CATEGORY = new Map<string, RemediationCategory>([
  ["SYSTEM_UPDATES_RUH_REMOTE_UPDATE", RemediationCategory.SOFTWARE_UPDATE],
]);

export const toRemediationCategory = (
  raw: FleetSystemUpdate,
): RemediationCategory | null =>
  FLEET_CATEGORY.get(raw.statusModel?.typeStatus ?? "") ?? null;

export async function fetchSystemUpdates(
  session: Session,
  equipmentKey: string,
): Promise<FleetSystemUpdate[]> {
  const res = await session.request(systemUpdatesUrl(equipmentKey));
  if (res.status === 404) return [];
  if (!res.ok) {
    throw new Error(
      `Fleet system updates for ${equipmentKey} returned ${res.status}`,
    );
  }
  return z.array(fleetSystemUpdateSchema).parse(await res.json());
}

export async function fetchUpdateCves(
  session: Session,
  updateNumber: string,
): Promise<string[]> {
  const res = await session.request(updateCvesUrl(updateNumber));
  if (res.status === 404) return [];
  if (!res.ok) {
    throw new Error(
      `Fleet CVEs for update ${updateNumber} returned ${res.status}`,
    );
  }
  const { cves } = updateCvesSchema.parse(await res.json());
  return [
    ...new Set(
      (cves ?? []).map((c) => c.text.trim().toUpperCase()).filter(Boolean),
    ),
  ];
}

export function toRemediationItem(
  raw: FleetSystemUpdate,
): FleetRemediationItem {
  const version = buildText(raw.softwareVersion);
  return {
    externalId: raw.number,
    description: buildText(raw.title) ?? `Fleet system update ${raw.number}`,
    narrative: version ? `Update to ${version}.` : null,
    release: { category: toRemediationCategory(raw) },
    devices: [],
    cveIds: [],
  };
}
