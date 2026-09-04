// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    integration: { findUnique: vi.fn() },
    integrationResourceSync: {
      findMany: vi.fn(),
      upsert: vi.fn(),
      update: vi.fn(),
    },
  },
}));

vi.mock("@/lib/db", () => ({ default: mockPrisma }));

// The Inngest client pulls in the whole event-schema graph; the functions under
// test only need `createFunction` to hand back its handler.
vi.mock("../../client", () => ({
  inngest: {
    createFunction: (
      _config: unknown,
      _trigger: unknown,
      // biome-ignore lint/suspicious/noExplicitAny: the handler is what we exercise
      handler: any,
    ) => handler,
  },
}));

const { mockStrategy, mockRequirePlatform, mockModuleForResource } = vi.hoisted(
  () => ({
    mockStrategy: vi.fn(),
    mockRequirePlatform: vi.fn(),
    mockModuleForResource: vi.fn(),
  }),
);

vi.mock("@/features/integrations/core/registry", () => ({
  requirePlatform: mockRequirePlatform,
  defaultSyncEveryFor: () => null,
}));

vi.mock("@/features/integrations/core/sync/resources", () => ({
  moduleForResource: mockModuleForResource,
}));

const { mockDecryptCredentials, mockParseAuthCredential, mockUsesGenericAuth } =
  vi.hoisted(() => ({
    mockDecryptCredentials: vi.fn(),
    mockParseAuthCredential: vi.fn(),
    mockUsesGenericAuth: vi.fn(),
  }));

vi.mock("@/features/integrations/core/credentials", () => ({
  decryptCredentials: mockDecryptCredentials,
  parseAuthCredential: mockParseAuthCredential,
  usesGenericAuth: mockUsesGenericAuth,
}));

import { Prisma, ResourceType, SyncStatusEnum } from "@/generated/prisma";
import { syncAllIntegrations, syncIntegration } from "../sync-integrations";

/**
 * These two functions are the only thing standing between a misbehaving
 * platform and a wedged sync row
 */

// A fake `step` that runs everything inline and records the order.
const makeStep = () => {
  const order: string[] = [];
  return {
    order,
    // biome-ignore lint/suspicious/noExplicitAny: mirrors Inngest's step.run
    run: vi.fn(async (name: string, fn: any) => {
      order.push(name);
      return fn();
    }),
    sendEvent: vi.fn(),
  };
};

const PLATFORM_MODULE = {
  definition: {
    configSchema: { parse: (value: unknown) => value },
    credentialSchema: { parse: (value: unknown) => value },
  },
  sync: mockStrategy,
};

const loadedRow = (overrides: Record<string, unknown> = {}) => ({
  platform: "PARTNER",
  integrationUserId: "shadow-user",
  syncEvery: 300,
  config: { integrationUri: "https://p.example.com", resource: "Asset" },
  credentials: null,
  resourceSyncs: [
    {
      cursor: null,
      lastSuccessfulSync: null,
      consecutiveFailures: 0,
      syncEvery: null,
    },
  ],
  ...overrides,
});

const runSync = (step: ReturnType<typeof makeStep>) =>
  // biome-ignore lint/suspicious/noExplicitAny: the handler's Inngest ctx is stubbed
  (syncIntegration as any)({
    event: {
      data: { integrationId: "integration-1", resource: ResourceType.Asset },
    },
    step,
  });

beforeEach(() => {
  vi.clearAllMocks();
  mockRequirePlatform.mockReturnValue(PLATFORM_MODULE);
  // No resource module by default: the platform owns the sync, as `partner` does.
  mockModuleForResource.mockReturnValue(undefined);
  mockPrisma.integration.findUnique.mockResolvedValue(loadedRow());
  mockStrategy.mockResolvedValue({ cursor: null, pending: true });
  mockParseAuthCredential.mockReturnValue({ authType: "None" });
});

/**
 * Where a sync attempt is routed. A resource module knows how to sync itself; a
 * platform without one syncs at the platform level. Route it wrong and the sync
 * either runs the wrong code or silently never runs.
 */
describe("syncIntegration — dispatch", () => {
  it("hands the attempt to the resource module that owns the resource", async () => {
    const resourceSync = vi.fn().mockResolvedValue({ cursor: { at: 7 } });
    mockModuleForResource.mockReturnValue({ sync: resourceSync });

    const result = await runSync(makeStep());

    expect(resourceSync).toHaveBeenCalledTimes(1);
    expect(mockStrategy).not.toHaveBeenCalled();
    expect(result).toEqual({ success: true, pending: false });
  });

  it("gives the resource module the same context a platform sync gets", async () => {
    const resourceSync = vi.fn().mockResolvedValue({ cursor: null });
    mockModuleForResource.mockReturnValue({ sync: resourceSync });

    await runSync(makeStep());

    expect(resourceSync.mock.calls[0][0]).toMatchObject({
      integrationId: "integration-1",
      config: { integrationUri: "https://p.example.com", resource: "Asset" },
      cursor: null,
      lastSuccessfulSync: null,
    });
  });

  it("falls back to the platform sync when no resource module owns it", async () => {
    await runSync(makeStep());

    expect(mockStrategy).toHaveBeenCalledTimes(1);
  });

  it("closes out a resource module's outcome exactly like a platform sync's", async () => {
    mockModuleForResource.mockReturnValue({
      sync: async () => ({ cursor: { page: 2 }, pending: false }),
    });

    await runSync(makeStep());

    expect(mockPrisma.integrationResourceSync.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: SyncStatusEnum.Success,
          consecutiveFailures: 0,
          cursor: { page: 2 },
        }),
      }),
    );
  });

  // A module with neither is a registration bug. Recording Error surfaces it on
  // the row instead of letting the resource look perpetually up to date.
  it("records Error when the platform can sync neither way", async () => {
    mockModuleForResource.mockReturnValue(undefined);
    mockRequirePlatform.mockReturnValue({
      ...PLATFORM_MODULE,
      sync: undefined,
    });

    const result = await runSync(makeStep());

    expect(mockPrisma.integrationResourceSync.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: SyncStatusEnum.Error,
          errorMessage: "PARTNER has no sync for Asset",
        }),
      }),
    );
    expect(result).toEqual({ success: false, pending: false });
  });
});

describe("syncIntegration — loading", () => {
  it("never lets decrypted credentials cross a step boundary", async () => {
    await runSync(makeStep());

    // A step's return value is shipped to and memoized by the Inngest service,
    // so the load step must not carry the ciphertext, let alone plaintext.
    expect(mockPrisma.integration.findUnique).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ omit: { credentials: true } }),
    );
    // The strategy step re-reads them in-process instead.
    expect(mockPrisma.integration.findUnique).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ select: { credentials: true } }),
    );
  });

  it("does not retry a deleted integration", async () => {
    mockPrisma.integration.findUnique.mockResolvedValue(null);

    await expect(runSync(makeStep())).rejects.toThrow(/not found/);
  });
});

describe("syncIntegration — credential parsing", () => {
  it("parses a non-generic-auth platform's decrypted credentials directly, without forcing them through the {authType} shape", async () => {
    mockPrisma.integration.findUnique.mockResolvedValue(
      loadedRow({ credentials: new Uint8Array([1]) }),
    );
    mockDecryptCredentials.mockReturnValue({
      username: "svc",
      password: "hunter2",
    });
    mockUsesGenericAuth.mockReturnValue(false);
    const credentialSchemaParse = vi.fn((value: unknown) => value);
    mockRequirePlatform.mockReturnValue({
      ...PLATFORM_MODULE,
      definition: {
        ...PLATFORM_MODULE.definition,
        credentialSchema: { parse: credentialSchemaParse },
      },
    });

    await runSync(makeStep());

    expect(credentialSchemaParse).toHaveBeenCalledWith({
      username: "svc",
      password: "hunter2",
    });
    expect(mockParseAuthCredential).not.toHaveBeenCalled();
  });

  it("routes a generic-auth platform's credentials through parseAuthCredential's None-fallback", async () => {
    mockUsesGenericAuth.mockReturnValue(true);
    const credentialSchemaParse = vi.fn((value: unknown) => value);
    mockRequirePlatform.mockReturnValue({
      ...PLATFORM_MODULE,
      definition: {
        ...PLATFORM_MODULE.definition,
        credentialSchema: { parse: credentialSchemaParse },
      },
    });

    await runSync(makeStep());

    expect(mockParseAuthCredential).toHaveBeenCalledWith(null, "integration-1");
    expect(credentialSchemaParse).toHaveBeenCalledWith({ authType: "None" });
  });
});

describe("syncIntegration — claiming the attempt", () => {
  it("stamps nextSyncAt before running the strategy, not after", async () => {
    const step = makeStep();
    await runSync(step);

    // If this were written on completion, a crashed worker would never advance
    // it and the row would wedge forever.
    expect(step.order).toEqual([
      "load-integration",
      "claim-attempt",
      "run-sync-strategy",
      "finalize-sync",
    ]);
    expect(mockPrisma.integrationResourceSync.upsert).toHaveBeenCalledBefore(
      mockStrategy,
    );
  });

  it("marks the row Pending with a fresh attempt time", async () => {
    await runSync(makeStep());

    const args = mockPrisma.integrationResourceSync.upsert.mock.calls[0][0];
    expect(args.update).toMatchObject({
      status: SyncStatusEnum.Pending,
      errorMessage: null,
    });
    expect(args.update.nextSyncAt.getTime()).toBeGreaterThan(Date.now());
  });
});

describe("syncIntegration — finalizing", () => {
  it("leaves a successful hand-off Pending for the callback to close out", async () => {
    mockStrategy.mockResolvedValue({ cursor: null, pending: true });

    const result = await runSync(makeStep());

    // Only the schedule is touched — no status, so the row stays Pending and
    // `upsertResourceSync` still owns closing it out.
    const data =
      mockPrisma.integrationResourceSync.update.mock.calls[0][0].data;
    expect(Object.keys(data)).toEqual(["nextSyncAt"]);
    expect(result).toEqual({ success: true, pending: true });
  });

  it("clears the failure-assumption backoff once a hand-off succeeds", async () => {
    mockStrategy.mockResolvedValue({ cursor: null, pending: true });

    await runSync(makeStep());

    // The claim in step 2 assumes the attempt will fail, and
    // `upsertResourceSync` never writes nextSyncAt. If this didn't reset it, a
    // healthy push platform would tick at twice its configured interval.
    const claimed =
      mockPrisma.integrationResourceSync.upsert.mock.calls[0][0].update
        .nextSyncAt;
    const settled =
      mockPrisma.integrationResourceSync.update.mock.calls[0][0].data
        .nextSyncAt;
    expect(settled.getTime()).toBeLessThan(claimed.getTime());
  });

  it("records success and the new cursor for a platform that fetched", async () => {
    mockStrategy.mockResolvedValue({ cursor: { v: 1, offset: 500 } });

    await runSync(makeStep());

    expect(
      mockPrisma.integrationResourceSync.update.mock.calls[0][0].data,
    ).toMatchObject({
      status: SyncStatusEnum.Success,
      errorMessage: null,
      consecutiveFailures: 0,
      cursor: { v: 1, offset: 500 },
    });
  });

  it("clears the cursor with DbNull, which is what a Json? column needs", async () => {
    mockStrategy.mockResolvedValue({ cursor: null });

    await runSync(makeStep());

    expect(
      mockPrisma.integrationResourceSync.update.mock.calls[0][0].data.cursor,
    ).toBe(Prisma.DbNull);
  });

  it("records the failure and backs off further next time", async () => {
    mockStrategy.mockRejectedValue(new Error("upstream exploded"));

    const result = await runSync(makeStep());

    expect(
      mockPrisma.integrationResourceSync.update.mock.calls[0][0].data,
    ).toMatchObject({
      status: SyncStatusEnum.Error,
      errorMessage: "upstream exploded",
      consecutiveFailures: { increment: 1 },
    });
    expect(result).toEqual({ success: false, pending: false });
  });

  it("surfaces an unregistered platform as an error on the row", async () => {
    mockRequirePlatform.mockImplementation(() => {
      throw new Error("No platform module is registered for FLEET.");
    });

    await runSync(makeStep());

    // Resolving the module inside the strategy step's try is what makes this an
    // operator-visible errorMessage rather than an uncaught throw that would
    // skip finalization entirely.
    expect(
      mockPrisma.integrationResourceSync.update.mock.calls[0][0].data,
    ).toMatchObject({
      status: SyncStatusEnum.Error,
      errorMessage: "No platform module is registered for FLEET.",
    });
  });
});

describe("syncAllIntegrations", () => {
  const dueRow = (id: string, resource: ResourceType) => ({
    integrationId: `i-${id}`,
    resource,
  });

  it("fans out one event per due (integration, resource)", async () => {
    mockPrisma.integrationResourceSync.findMany.mockResolvedValue([
      dueRow("PARTNER", ResourceType.Asset),
      dueRow("AI", ResourceType.Vulnerability),
    ]);
    const step = makeStep();

    // biome-ignore lint/suspicious/noExplicitAny: the handler's Inngest ctx is stubbed
    const result = await (syncAllIntegrations as any)({ step });

    expect(result).toEqual({ syncedCount: 2 });
    expect(step.sendEvent).toHaveBeenCalledWith("trigger-syncs", [
      {
        name: "integration/sync.requested",
        data: { integrationId: "i-PARTNER", resource: ResourceType.Asset },
      },
      {
        name: "integration/sync.requested",
        data: { integrationId: "i-AI", resource: ResourceType.Vulnerability },
      },
    ]);
  });

  it("only considers rows that are enabled at both levels and actually due", async () => {
    mockPrisma.integrationResourceSync.findMany.mockResolvedValue([]);
    // biome-ignore lint/suspicious/noExplicitAny: the handler's Inngest ctx is stubbed
    await (syncAllIntegrations as any)({ step: makeStep() });

    expect(
      mockPrisma.integrationResourceSync.findMany.mock.calls[0][0].where,
    ).toEqual({
      enabled: true,
      integration: { enabled: true },
      OR: [{ nextSyncAt: null }, { nextSyncAt: { lte: expect.any(Date) } }],
    });
  });
});
