// @vitest-environment node
import { describe, expect, it } from "vitest";

import { PlatformEnum, ResourceType } from "@/generated/prisma";
import type { AnyConnectorModule, ResourceModule } from "../../types";
import {
  hasResourceModules,
  moduleForResource,
  resourcesFor,
} from "../resources";

/**
 * The absence of ResourceModule fields is what tells core a platform is
 * generic. If that inference is wrong in either direction, an integration
 * either syncs the wrong resource or silently never syncs at all.
 */

const stubResourceModule = (): ResourceModule<unknown, unknown, unknown> => ({
  listChanged: async function* () {},
  get: async () => ({}),
  toCanonical: (raw) => raw,
  defaultSyncEvery: null,
});

const moduleWith = (fields: Partial<AnyConnectorModule>): AnyConnectorModule =>
  ({
    definition: {
      platform: PlatformEnum.FLEET,
      displayName: "test",
      // biome-ignore lint/suspicious/noExplicitAny: schemas are irrelevant here
      configSchema: {} as any,
      // biome-ignore lint/suspicious/noExplicitAny: schemas are irrelevant here
      credentialSchema: {} as any,
    },
    sync: async () => ({ cursor: null }),
    ...fields,
  }) as AnyConnectorModule;

describe("resourcesFor", () => {
  it("derives one resource per ResourceModule field", () => {
    const module = moduleWith({
      workOrders: stubResourceModule(),
      notifications: stubResourceModule(),
    });

    expect(resourcesFor(module, {})).toEqual([
      ResourceType.WorkOrder,
      ResourceType.SourceRecord,
    ]);
  });

  it("reads config.resource when a platform has no ResourceModules", () => {
    const module = moduleWith({});

    expect(resourcesFor(module, { resource: ResourceType.Asset })).toEqual([
      ResourceType.Asset,
    ]);
  });

  it("ignores config.resource once ResourceModules exist", () => {
    const module = moduleWith({ assets: stubResourceModule() });

    expect(
      resourcesFor(module, { resource: ResourceType.Vulnerability }),
    ).toEqual([ResourceType.Asset]);
  });

  it("fails loudly rather than returning [] and never syncing", () => {
    const module = moduleWith({});

    expect(() => resourcesFor(module, {})).toThrow();
    expect(() => resourcesFor(module, { resource: "Nonsense" })).toThrow();
  });
});

describe("moduleForResource / hasResourceModules", () => {
  it("round-trips every module field", () => {
    const workOrders = stubResourceModule();
    const assets = stubResourceModule();
    const notifications = stubResourceModule();
    const module = moduleWith({ workOrders, assets, notifications });

    expect(moduleForResource(module, ResourceType.WorkOrder)).toBe(workOrders);
    expect(moduleForResource(module, ResourceType.Asset)).toBe(assets);
    expect(moduleForResource(module, ResourceType.SourceRecord)).toBe(
      notifications,
    );
  });

  it("returns undefined for a resource no field maps to", () => {
    const module = moduleWith({ assets: stubResourceModule() });

    expect(
      moduleForResource(module, ResourceType.Vulnerability),
    ).toBeUndefined();
    expect(moduleForResource(module, ResourceType.WorkOrder)).toBeUndefined();
  });

  it("distinguishes generic platforms from code-defined ones", () => {
    expect(hasResourceModules(moduleWith({}))).toBe(false);
    expect(
      hasResourceModules(moduleWith({ assets: stubResourceModule() })),
    ).toBe(true);
  });
});
