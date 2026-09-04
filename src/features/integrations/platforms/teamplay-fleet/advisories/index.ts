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
import { inngestFleetAdvisories, syncAdvisories } from "./sync";

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
    await inngestFleetAdvisories([draft], draft.integrationId, session);
    return { externalId: draft.vendorId, raw: draft.raw };
  },
  apiUrlFor: () => ADVISORIES_URL,
  webUrlFor: (externalId) => advisoryWebUrl(externalId),
  defaultSyncEvery: 3600,
};
