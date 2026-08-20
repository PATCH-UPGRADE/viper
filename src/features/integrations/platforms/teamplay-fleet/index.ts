import { PlatformEnum } from "@/generated/prisma";
import type { ConnectorModule } from "../../core/types";
import { assets } from "./assets";
import {
  configSchema,
  credentialSchema,
  type FleetConfig,
  type FleetCreds,
  SIEMENS_HEALTHINEERS,
} from "./config";
import { onCreate } from "./on-create";
import { fleetSync } from "./sync";

export const teamplayFleet: ConnectorModule<FleetConfig, FleetCreds> = {
  definition: {
    platform: PlatformEnum.FLEET,
    displayName: SIEMENS_HEALTHINEERS,
    configSchema,
    credentialSchema,
  },
  sync: fleetSync,
  onCreate,
  assets,
};
