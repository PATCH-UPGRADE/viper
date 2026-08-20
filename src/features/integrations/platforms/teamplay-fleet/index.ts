import { PlatformEnum } from "@/generated/prisma";
import type { ConnectorModule } from "../../core/types";
import {
  configSchema,
  credentialSchema,
  type FleetConfig,
  type FleetCreds,
  SIEMENS_HEALTHINEERS,
} from "./config";
import { onCreate } from "./on-create";

// TODO for advisory
const mockFleetSync = async (): Promise<never> => {
  throw new Error("eamplay fleet sync later");
};

export const teamplayFleet: ConnectorModule<FleetConfig, FleetCreds> = {
  definition: {
    platform: PlatformEnum.FLEET,
    displayName: SIEMENS_HEALTHINEERS,
    configSchema,
    credentialSchema,
  },
  sync: mockFleetSync,
  onCreate,
};
