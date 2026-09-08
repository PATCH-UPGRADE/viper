import type { ResourceModule } from "../../../core/types";
import type { FleetConfig, FleetCreds } from "../config";
import { ADVISORIES_URL, advisoryWebUrl } from "../urls";
import {
  type FleetAdvisoryItem,
  type FleetAdvisoryRecord,
  get,
  listChanged,
  toCanonical,
} from "./advisories";
import { recordAdvisories, syncAdvisories } from "./sync";

export interface FleetAdvisoryDraft extends FleetAdvisoryItem {
  integrationId: string;
}

export const notifications: ResourceModule<
  FleetAdvisoryItem,
  FleetAdvisoryRecord,
  FleetConfig,
  FleetCreds,
  FleetAdvisoryDraft
> = {
  sync: syncAdvisories,
  listChanged,
  get,
  toCanonical,
  create: async (session, draft) => {
    await recordAdvisories(draft.integrationId, [draft]);
    return { externalId: draft.vendorId, raw: draft.raw };
  },
  update: async (session, externalId, patch) => {
    const { integrationId } = patch;
    if(!integrationId) {
      throw new Error("Updating a Fleet advisory needs an integrationId")
    }
    const record = await get(session, externalId);
    const item: FleetAdvisoryItem = {...toCanonical(record), ...patch};
    await recordAdvisories(integrationId, [item]);
    return { externalId, raw: item.raw};
  },
  apiUrlFor: () => ADVISORIES_URL,
  webUrlFor: (externalId) => advisoryWebUrl(externalId),
  defaultSyncEvery: 3600,
};
