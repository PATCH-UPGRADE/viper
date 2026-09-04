// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ default: {} }));

import { PlatformEnum, ResourceType } from "@/generated/prisma";
import { defaultSyncEveryFor, registry, requirePlatform } from "../registry";
import { moduleForResource } from "../sync/resources";

/**
 * Importing this module runs the registry's load-time assertion, so simply
 * getting here proves no platform is keyed under the wrong enum.
 */

describe("registry", () => {
  it("registers the generic platforms", () => {
    expect(requirePlatform(PlatformEnum.AI).definition.platform).toBe(
      PlatformEnum.AI,
    );
    expect(requirePlatform(PlatformEnum.PARTNER).definition.platform).toBe(
      PlatformEnum.PARTNER,
    );
  });

  it("registers templay Fleet", () => {
    expect(requirePlatform(PlatformEnum.FLEET).definition.platform).toBe(
      PlatformEnum.FLEET,
    );
  });

  it("has no cadence opinion for a platform without ResourceModules", () => {
    expect(defaultSyncEveryFor(PlatformEnum.AI, ResourceType.Asset)).toBeNull();
  });

  // Core dispatches to a resource module's sync, else the platform's. A module
  // with neither is registered but can never sync, and nothing else would say so.
  it.each(Object.keys(registry) as PlatformEnum[])(
    "%s can actually sync something",
    (platform) => {
      const module = requirePlatform(platform);
      const resourceModules = [
        module.assets,
        module.workOrders,
        module.notifications,
      ].filter((m) => m !== undefined);

      expect(module.sync ?? resourceModules.length).toBeTruthy();
      for (const resourceModule of resourceModules) {
        expect(resourceModule.sync).toBeTypeOf("function");
      }
    },
  );
});

describe("teamplay Fleet", () => {
  it("syncs assets through its resource module, not a platform sync", () => {
    const module = requirePlatform(PlatformEnum.FLEET);
    expect(module.sync).toBeUndefined();
    expect(moduleForResource(module, ResourceType.Asset)?.sync).toBeTypeOf(
      "function",
    );
  });

  it("takes its asset cadence from the resource module", () => {
    expect(defaultSyncEveryFor(PlatformEnum.FLEET, ResourceType.Asset)).toBe(
      86400,
    );
  });
});

describe("generic platform definitions", () => {
  it.each([PlatformEnum.AI, PlatformEnum.PARTNER])(
    "%s owns its whole sync and maps nothing",
    (platform) => {
      const module = requirePlatform(platform);
      expect(module.sync).toBeTypeOf("function");
      // Items arrive already in VIPER's shape, so there is nothing to map.
      expect(module.assets).toBeUndefined();
      expect(module.workOrders).toBeUndefined();
      expect(module.notifications).toBeUndefined();
    },
  );

  it.each([PlatformEnum.AI, PlatformEnum.PARTNER])(
    "%s declares its resource in config, since it has no ResourceModules",
    (platform) => {
      const parsed = requirePlatform(
        platform,
      ).definition.configSchema.safeParse({
        integrationUri: "https://example.com/",
        resource: ResourceType.Asset,
      });
      expect(parsed.success).toBe(true);
      expect(parsed.data?.resource).toBe(ResourceType.Asset);
    },
  );
});
