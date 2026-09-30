import "server-only";
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
 * The AI crawler platform: point it at any URL and an AI agent works out how
 * to read it.
 */
export const ai: ConnectorModule<AiConfig, AiCreds> = {
  definition: {
    platform: PlatformEnum.AI,
    displayName: "AI Crawler",
    description: "Point it at any URL — an AI agent works out how to read it.",
    categories: ["Vulnerability Management Platforms"],
    configSchema,
    credentialSchema,
  },
  sync: aiSync,
};
