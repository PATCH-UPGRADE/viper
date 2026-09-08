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
import { syncAdvisories } from "./sync";

export const notifications: ResourceModule<
  FleetAdvisoryItem,
  FleetAdvisoryRecord,
  FleetConfig,
  FleetCreds
> = {
  sync: syncAdvisories,
  listChanged,
  get,
  toCanonical,
  apiUrlFor: () => ADVISORIES_URL,
  webUrlFor: (externalId) => advisoryWebUrl(externalId),
  defaultSyncEvery: 3600,
};
