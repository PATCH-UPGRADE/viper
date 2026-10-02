import { PlatformEnum } from "@/generated/prisma";
import { SIEMENS_HEALTHINEERS } from "@/lib/manufacturer-catalog";
import type { ConnectorModule } from "../../core/types";
import { notifications } from "./advisories";
import { assets } from "./assets";
import {
  configSchema,
  credentialSchema,
  type FleetConfig,
  type FleetCreds,
} from "./config";
import { onCreate } from "./on-create";
import { createFleetSession } from "./session";
import { workOrders } from "./work-orders";

export const teamplayFleet: ConnectorModule<FleetConfig, FleetCreds> = {
  definition: {
    platform: PlatformEnum.FLEET,
    displayName: SIEMENS_HEALTHINEERS.canonicalDisplayName,
    description: "Sync device and service data from teamplay Fleet.",
    categories: ["Hospital Inventory", "Notifications", "Ticketing Platforms"],
    singleton: true,
    configSchema,
    credentialSchema,
  },
  onCreate,
  createSession: createFleetSession,
  assets,
  workOrders,
  notifications,
};
