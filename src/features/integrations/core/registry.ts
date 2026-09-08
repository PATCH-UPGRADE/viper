import "server-only";
import type { SourceRecordAdapter } from "@/features/inbox/source-adapter";
import type { PlatformEnum, ResourceType } from "@/generated/prisma";
import { ai } from "../platforms/ai";
import { medisao } from "../platforms/medisao";
import { partner } from "../platforms/partner";
import { teamplayFleet } from "../platforms/teamplay-fleet";
import type { Category } from "../types";
import { moduleForResource } from "./sync/resources";
import type { AnyConnectorModule, CommentsApi, InquiriesApi } from "./types";

/**
 * Every platform VIPER knows how to run, keyed by the enum on the row.
 */
export const registry: Partial<Record<PlatformEnum, AnyConnectorModule>> = {
  AI: ai,
  PARTNER: partner,
  FLEET: teamplayFleet,
  MEDISAO: medisao,
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

export const displayNameFor = (platform: PlatformEnum): string =>
  registry[platform]?.definition.displayName ?? platform;

export const categoriesFor = (platform: PlatformEnum): Category[] =>
  registry[platform]?.definition.categories ?? [];

/**
 * How this platform's recorded snapshots become Notifications, if it records
 * any. Undefined for a platform that has no notifications resource.
 */
export const sourceAdapterFor = (
  platform: PlatformEnum,
): SourceRecordAdapter | undefined =>
  registry[platform]?.notifications?.sourceRecords;

/**
 * How this platform's comments on a resource are read and written, if it has
 * any. Undefined for a platform with no comment surface, which is not an error.
 */
export const commentsApiFor = (
  platform: PlatformEnum,
  resource: ResourceType,
): CommentsApi | undefined =>
  moduleForResource(requirePlatform(platform), resource)?.comments;

/**
 * How questions to a manufacturer about a resource are raised, if this platform
 * carries them. Undefined for a platform with no inquiry surface.
 */
export const inquiriesApiFor = (
  platform: PlatformEnum,
  resource: ResourceType,
): InquiriesApi | undefined =>
  moduleForResource(requirePlatform(platform), resource)?.inquiries;

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
