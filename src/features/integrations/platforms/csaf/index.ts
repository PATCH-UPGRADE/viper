import "server-only";
import type { ConnectorModule } from "@/features/integrations/core/types";
import { PlatformEnum } from "@/generated/prisma";
import { advisories } from "./advisories";
import {
  configSchema,
  credentialSchema,
  type CsafConfig,
  type CsafCreds,
} from "./config";
import { createCsafSession } from "./session";

export const csaf: ConnectorModule<CsafConfig, CsafCreds> = {
  definition: {
    platform: PlatformEnum.CSAF,
    displayName: "CSAF Advisories",
    description:
      "Security advisories from any CSAF provider, such as CISA's ICS and medical advisories.",
    categories: ["Notifications"],
    configSchema,
    credentialSchema,
  },
  createSession: () => createCsafSession(),
  notifications: advisories,
};
