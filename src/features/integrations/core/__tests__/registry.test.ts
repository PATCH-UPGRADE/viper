// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ default: {} }));

import { PlatformEnum, ResourceType } from "@/generated/prisma";
import { defaultSyncEveryFor, requirePlatform } from "../registry";

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

  // TODO: VW-431, test to make sure fleet gets registered

  it("has no cadence opinion for a platform without ResourceModules", () => {
    expect(defaultSyncEveryFor(PlatformEnum.AI, ResourceType.Asset)).toBeNull();
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
