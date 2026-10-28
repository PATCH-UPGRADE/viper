import { PlatformEnum } from "@/generated/prisma";
import type { ConnectorModule } from "../../core/types";
import {
  configSchema,
  credentialSchema,
  type ServiceNowConfig,
  type ServiceNowCreds,
} from "./config";
import { createServiceNowSession } from "./session";
import { workOrders } from "./work-orders";

export const serviceNow: ConnectorModule<ServiceNowConfig, ServiceNowCreds> = {
  definition: {
    platform: PlatformEnum.SERVICENOW,
    displayName: "ServiceNow",
    description: "Sync change requests from ServiceNow as work orders.",
    categories: ["Ticketing Platforms"],
    singleton: true,
    configSchema,
    credentialSchema,
  },
  createSession: createServiceNowSession,
  workOrders,
};
