import type { ResourceModule } from "@/features/integrations/core/types";
import type { FleetConfig, FleetCreds } from "../config";
import { ADVISORIES_URL, advisoryWebUrl } from "../urls";
import { syncRemediations } from "./sync";

export const remediations: ResourceModule<
  unknown,
  unknown,
  FleetConfig,
  FleetCreds
> = {
  sync: syncRemediations,
  apiUrlFor: () => ADVISORIES_URL,
  webUrlFor: (externalId) => advisoryWebUrl(externalId),
  defaultSyncEvery: 86400,
};
