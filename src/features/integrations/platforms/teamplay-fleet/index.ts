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
import { workOrders } from "./work-orders";

export const teamplayFleet: ConnectorModule<FleetConfig, FleetCreds> = {
  definition: {
    platform: PlatformEnum.FLEET,
    displayName: SIEMENS_HEALTHINEERS,
    description: "Sync device and service data from teamplay Fleet.",
    categories: ["Hospital Inventory", "Notifications", "Ticketing Platforms"],
    configSchema,
    credentialSchema,
  },
  onCreate,
  assets,
  workOrders,
};
