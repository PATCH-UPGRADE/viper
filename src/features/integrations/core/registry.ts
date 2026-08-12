import "server-only";
import type { PlatformEnum, ResourceType } from "@/generated/prisma";
import { ai } from "../platforms/ai";
import { partner } from "../platforms/partner";
import { moduleForResource } from "./sync/resources";
import type { AnyConnectorModule } from "./types";

/**
 * Every platform VIPER knows how to run, keyed by the enum on the row.
 */
export const registry: Partial<Record<PlatformEnum, AnyConnectorModule>> = {
  AI: ai,
  PARTNER: partner,
  // TODO: VW-431 add teamplay Fleet here
};

export const requirePlatform = (platform: PlatformEnum): AnyConnectorModule => {
  const module = registry[platform];
  if (!module) {
    throw new Error(
      `No platform module is registered for ${platform}. Registered: ${Object.keys(
        registry,
      )}`,
    );
  }
  return module;
};

/** The platform author's own sense of how fast this resource moves. */
export const defaultSyncEveryFor = (
  platform: PlatformEnum,
  resource: ResourceType,
): number | null => {
  const module = registry[platform];
  if (!module) return null;
  return moduleForResource(module, resource)?.defaultSyncEvery ?? null;
};

// load-time assertion
for (const [key, module] of Object.entries(registry)) {
  if (module && module.definition.platform !== key) {
    throw new Error(
      `Registry key "${key}" does not match definition.platform "${module.definition.platform}".`,
    );
  }
}
