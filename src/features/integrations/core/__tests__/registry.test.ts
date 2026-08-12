// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ default: {} }));

import { PlatformEnum, ResourceType } from "@/generated/prisma";
import {
  defaultSyncEveryFor,
  isPollable,
  registry,
  requirePlatform,
} from "../registry";

/**
 * Importing this module runs the registry's load-time assertions, so simply
 * getting here proves every registered platform is coherent.
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

  it("does not register FLEET yet, and says so", () => {
    expect(registry[PlatformEnum.FLEET]).toBeUndefined();
    expect(() => requirePlatform(PlatformEnum.FLEET)).toThrow(/FLEET/);
    expect(() => requirePlatform(PlatformEnum.FLEET)).toThrow(
      /No platform module is registered/,
    );
  });

  it("schedules the generic platforms, because they declare 'poll'", () => {
    expect(isPollable(PlatformEnum.AI)).toBe(true);
    expect(isPollable(PlatformEnum.PARTNER)).toBe(true);
  });

  it("still schedules an unregistered platform, so the failure is visible", () => {
    // Filtering FLEET out here would leave the row Pending forever with nothing
    // to look at. Letting it through records a real error on the resource row.
    expect(isPollable(PlatformEnum.FLEET)).toBe(true);
  });

  it("has no cadence opinion for a platform without ResourceModules", () => {
    expect(defaultSyncEveryFor(PlatformEnum.AI, ResourceType.Asset)).toBeNull();
    expect(
      defaultSyncEveryFor(PlatformEnum.FLEET, ResourceType.WorkOrder),
    ).toBeNull();
  });
});

describe("generic platform definitions", () => {
  it.each([PlatformEnum.AI, PlatformEnum.PARTNER])(
    "%s hands off rather than fetching",
    (platform) => {
      const module = requirePlatform(platform);
      expect(module.definition.changeSources).toEqual(["poll", "push"]);
      expect(module.sync).toBeTypeOf("function");
      // Items arrive already in VIPER's shape, so there is nothing to map.
      expect(module.assets).toBeUndefined();
      expect(module.workOrders).toBeUndefined();
      expect(module.notifications).toBeUndefined();
    },
  );

  it.each([PlatformEnum.AI, PlatformEnum.PARTNER])(
    "%s's session refuses to be used",
    async (platform) => {
      const session = await requirePlatform(platform).createSession({
        config: {},
        creds: {},
      });
      await expect(session.request("/anything")).rejects.toThrow(
        /does not fetch from the upstream/,
      );
    },
  );
});
