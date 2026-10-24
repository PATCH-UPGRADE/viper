import type { ResourceModule } from "@/features/integrations/core/types";
import type { FleetConfig, FleetCreds } from "../config";
import { syncRemediations } from "./sync";

export const remediations: ResourceModule<
  unknown,
  unknown,
  FleetConfig,
  FleetCreds
> = {
  sync: syncRemediations,
  defaultSyncEvery: 86400,
};
