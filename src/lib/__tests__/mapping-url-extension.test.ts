// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PlatformEnum } from "@/generated/prisma";

vi.mock("server-only", () => ({}));
// This module also holds the webhook + inngest extensions, which reach the real
// client at import time. Neither is under test here.
vi.mock("@/lib/db", () => ({ default: {} }));
vi.mock("@/inngest/client", () => ({ inngest: { send: async () => {} } }));
// The extension reaches the registry through a lazy import to break a cycle;
// stub it so this test never loads the real platform modules (or a client).
vi.mock("@/features/integrations/core/registry", () => ({
  registry: {
    FLEET: {
      definition: { platform: PlatformEnum.FLEET },
      assets: {
        apiUrlFor: (externalId: string) =>
          `https://fake.test/api/${externalId}`,
        webUrlFor: (externalId: string) => `https://fake.test/ui/${externalId}`,
      },
    },
  },
}));

const { mappingUrlExtension, invalidateIntegrationUrlCache } = await import(
  "../prisma-client-extensions"
);

const INTEGRATION_ROW = {
  id: "int-1",
  platform: PlatformEnum.FLEET,
  config: {},
};

/**
 * `Prisma.defineExtension` is identity over its callback, and `$extends` just
 * records config — so the query handler can be pulled out and driven directly.
 */
const buildHandler = () => {
  const findMany = vi.fn(async () => [INTEGRATION_ROW]);
  const client = {
    integration: { findMany },
    $extends: (config: unknown) => config,
    // biome-ignore lint/suspicious/noExplicitAny: hand-rolled stand-in for the client
  } as any;

  // `$extends` above just hands the config straight back.
  const extension = mappingUrlExtension(client) as unknown as {
    query: {
      $allModels: {
        // biome-ignore lint/suspicious/noExplicitAny: driving the raw handler
        $allOperations: (params: any) => Promise<any>;
      };
    };
  };
  return {
    findMany,
    handler: extension.query.$allModels.$allOperations,
  };
};

const mapping = () => ({
  externalId: "US_1",
  upstreamApi: null as string | null,
  webUrl: null as string | null,
  integration: { id: "int-1", name: "Fleet", platform: PlatformEnum.FLEET },
});

beforeEach(() => {
  invalidateIntegrationUrlCache();
});

describe("mappingUrlExtension", () => {
  it("resolves mappings the query actually selected", async () => {
    const { handler } = buildHandler();
    const row = { id: "asset-1", externalMappings: [mapping()] };

    const result = await handler({
      model: "Asset",
      operation: "findUnique",
      args: { include: { externalMappings: true } },
      query: async () => row,
    });

    expect(result.externalMappings[0].webUrl).toBe("https://fake.test/ui/US_1");
    expect(result.externalMappings[0].upstreamApi).toBe(
      "https://fake.test/api/US_1",
    );
  });

  it("does not look up integrations for a query that selects no mappings", async () => {
    const { findMany, handler } = buildHandler();

    await handler({
      model: "Asset",
      operation: "findMany",
      args: {
        where: { externalMappings: { some: { integrationId: "int-1" } } },
      },
      query: async () => [{ id: "asset-1" }],
    });

    expect(findMany).not.toHaveBeenCalled();
  });

  it("reuses one integration snapshot across queries", async () => {
    const { findMany, handler } = buildHandler();
    const run = () =>
      handler({
        model: "Asset",
        operation: "findUnique",
        args: { include: { externalMappings: true } },
        query: async () => ({ externalMappings: [mapping()] }),
      });

    await run();
    await run();

    expect(findMany).toHaveBeenCalledTimes(1);
  });

  it("drops the snapshot when an integration is written", async () => {
    const { findMany, handler } = buildHandler();
    const run = () =>
      handler({
        model: "Asset",
        operation: "findUnique",
        args: { include: { externalMappings: true } },
        query: async () => ({ externalMappings: [mapping()] }),
      });

    await run();
    await handler({
      model: "Integration",
      operation: "update",
      args: { where: { id: "int-1" }, data: { config: {} } },
      query: async () => INTEGRATION_ROW,
    });
    await run();

    expect(findMany).toHaveBeenCalledTimes(2);
  });
});
