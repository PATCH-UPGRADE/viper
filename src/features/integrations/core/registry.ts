import "server-only";
import { z } from "zod";
import type { PlatformEnum, ResourceType } from "@/generated/prisma";
import { ai } from "../platforms/ai";
import { partner } from "../platforms/partner";
import { hasResourceModules, moduleForResource } from "./sync/resources";
import type { AnyConnectorModule } from "./types";

/**
 * Every platform VIPER knows how to run, keyed by the enum on the row.
 *
 * Deliberately `Partial`: `FLEET` has no module yet. Its old fetch-and-map path
 * has been deleted, and `platforms/teamplay-fleet/` is a later phase. Until then
 * a FLEET integration must fail with a message that says so, rather than
 * silently doing nothing.
 */
export const registry: Partial<Record<PlatformEnum, AnyConnectorModule>> = {
  AI: ai,
  PARTNER: partner,
};

export const requirePlatform = (platform: PlatformEnum): AnyConnectorModule => {
  const module = registry[platform];
  if (!module) {
    throw new Error(
      `No platform module is registered for ${platform}. Registered: ${Object.keys(
        registry,
      ).join(", ")}. The teamplay Fleet module lands in a later phase; until ` +
        `then a FLEET integration cannot be created or synced.`,
    );
  }
  return module;
};

/**
 * Does the cron schedule this platform?
 *
 * An unregistered platform answers **true** on purpose. Filtering it out here
 * would bury the misconfiguration: the row would sit `Pending` forever with
 * nothing to look at. Letting it through means `syncIntegration` records a real
 * error on the resource row, which is where an operator would look, and backoff
 * spaces the retries out on its own.
 */
export const isPollable = (platform: PlatformEnum): boolean =>
  registry[platform]?.definition.changeSources.includes("poll") ?? true;

/** The platform author's own sense of how fast this resource moves. */
export const defaultSyncEveryFor = (
  platform: PlatformEnum,
  resource: ResourceType,
): number | null => {
  const module = registry[platform];
  if (!module) return null;
  return moduleForResource(module, resource)?.defaultSyncEvery ?? null;
};

// ---------------------------------------------------------------------------
// Load-time assertions
// ---------------------------------------------------------------------------
// A platform that can never sync should be a startup error, not a silent no-op
// discovered weeks later by an operator wondering why nothing imports.
//
// Note the RFC asks to re-assert `genericConfigSchema.parse(config)` here. There
// is no config instance at load — only a schema — so the checkable equivalent is
// that the schema *declares* the key. That catches the same failure mode: a
// generic platform whose config forgot `resource`, which would make
// `resourcesFor` throw on every create. The value-level gate still runs in
// `resourcesFor` itself.
for (const [key, module] of Object.entries(registry)) {
  if (!module) continue;

  if (module.definition.platform !== key) {
    throw new Error(
      `Registry key "${key}" does not match definition.platform "${module.definition.platform}".`,
    );
  }

  if (module.definition.changeSources.length === 0) {
    throw new Error(
      `Platform ${key} declares no changeSources, so nothing would ever schedule it.`,
    );
  }

  if (!module.sync && !hasResourceModules(module)) {
    throw new Error(
      `Platform ${key} has neither a sync strategy nor any ResourceModule; there is nothing for core to run.`,
    );
  }

  if (!hasResourceModules(module)) {
    // No ResourceModules => generic platform => core reads config.resource.
    const schema = module.definition.configSchema;
    const declaresResource =
      schema instanceof z.ZodObject && "resource" in schema.shape;
    if (!declaresResource) {
      throw new Error(
        `Platform ${key} has no ResourceModule fields, so core resolves its resource from config.resource — ` +
          `but its configSchema does not declare a "resource" key. It would never sync.`,
      );
    }
  }
}
