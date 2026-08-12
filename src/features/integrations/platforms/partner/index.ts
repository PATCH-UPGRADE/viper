import "server-only";
import { createNoopSession } from "@/features/integrations/core/session/basic";
import type { ConnectorModule } from "@/features/integrations/core/types";
import { PlatformEnum } from "@/generated/prisma";
import {
  configSchema,
  credentialSchema,
  type PartnerConfig,
  type PartnerCreds,
} from "./config";
import { partnerSync } from "./sync";

/**
 * A partner that follows the VIPER standard (Blueflow, Helm).
 *
 * Items arrive already in our shape, so — like `ai` — every ResourceModule
 * field is omitted and the strategy just hands off.
 */
export const partner: ConnectorModule<PartnerConfig, PartnerCreds> = {
  definition: {
    platform: PlatformEnum.PARTNER,
    displayName: "Partner API",
    configSchema,
    credentialSchema,
    changeSources: ["poll", "push"],
  },
  createSession: async () => createNoopSession(),
  sync: partnerSync,
};
