import "server-only";
import { createNoopSession } from "@/features/integrations/core/session/basic";
import type { ConnectorModule } from "@/features/integrations/core/types";
import { PlatformEnum } from "@/generated/prisma";
import {
  type AiConfig,
  type AiCreds,
  configSchema,
  credentialSchema,
} from "./config";
import { aiSync } from "./sync";

/**
 * The AI crawler platform: point it at any URL and an n8n agent works out how
 * to read it.
 *
 * Items come back already in VIPER's shape — that is what the JSON Schema in
 * the hand-off is for — so there is nothing to translate and **every
 * ResourceModule field is omitted**.
 */
export const ai: ConnectorModule<AiConfig, AiCreds> = {
  definition: {
    platform: PlatformEnum.AI,
    displayName: "AI Crawler",
    configSchema,
    credentialSchema,
    // 'poll' is what makes the cron schedule it; 'push' is what happens when
    // the tick fires. Drop 'poll' and it would never be scheduled at all.
    changeSources: ["poll", "push"],
  },
  createSession: async () => createNoopSession(),
  sync: aiSync,
};
