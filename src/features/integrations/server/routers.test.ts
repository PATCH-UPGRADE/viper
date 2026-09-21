// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { mockCategoriesFor, mockDefaultSyncEveryFor, mockInngest, mockPrisma } =
  vi.hoisted(() => ({
    mockCategoriesFor: vi.fn(),
    mockDefaultSyncEveryFor: vi.fn(),
    mockInngest: { send: vi.fn() },
    mockPrisma: {
      integration: {
        count: vi.fn(),
        delete: vi.fn(),
        findFirst: vi.fn(),
        findMany: vi.fn(),
        findUnique: vi.fn(),
        update: vi.fn(),
      },
      integrationResourceSync: { findUnique: vi.fn(), update: vi.fn() },
      $transaction: vi.fn(),
    },
  }));

vi.mock("@/lib/db", () => ({ default: mockPrisma }));
vi.mock("@/inngest/client", () => ({ inngest: mockInngest }));
vi.mock("../core/registry", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../core/registry")>();
  return {
    ...actual,
    defaultSyncEveryFor: mockDefaultSyncEveryFor,
    displayNameFor: () => "Partner API",
    categoriesFor: mockCategoriesFor,
  };
});

import { PlatformEnum, ResourceType } from "@/generated/prisma";
import { createCallerFactory } from "@/trpc/init";
import { decryptCredentials, encryptCredentials } from "../core/credentials";
import { integrationsRouter } from "./routers";

const caller = createCallerFactory(integrationsRouter)({
  req: undefined,
  auth: { user: { id: "user-test" } },
});
const integrationRow = (syncEvery: number | null, nextSyncAt: Date | null) => ({
  id: "integration-1",
  name: "Partner feed",
  platform: PlatformEnum.PARTNER,
  syncEvery,
  config: { endpoint: "https://partner.example" },
  enabled: true,
  resourceSyncs: [
    {
      resource: ResourceType.Asset,
      nextSyncAt,
      syncEvery: null,
    },
  ],
});
const existingIntegration = {
  id: "integration-1",
  platform: PlatformEnum.PARTNER,
};

mockDefaultSyncEveryFor.mockReturnValue(900);
mockCategoriesFor.mockReturnValue([]);
beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.$transaction.mockImplementation((fn: (tx: unknown) => unknown) =>
    fn(mockPrisma),
  );
});

describe("integrationsRouter.getMany", () => {
  it("returns one unified, browser-safe list with resolved resource cadences", async () => {
    mockPrisma.integration.count.mockResolvedValue(1);
    mockPrisma.integration.findMany.mockResolvedValue([
      integrationRow(600, new Date(Date.now() - 1_000)),
    ]);

    const result = await caller.getMany({ search: "partner" });

    expect(mockPrisma.integration.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { name: { contains: "partner", mode: "insensitive" } },
        select: {
          id: true,
          name: true,
          platform: true,
          syncEvery: true,
          config: true,
          enabled: true,
          resourceSyncs: expect.any(Object),
        },
      }),
    );
    expect(result.items).toEqual([
      {
        id: "integration-1",
        name: "Partner feed",
        platform: PlatformEnum.PARTNER,
        platformLabel: "Partner API",
        categories: [],
        enabled: true,
        syncEvery: 600,
        config: { endpoint: "https://partner.example" },
        resourceSyncs: [
          expect.objectContaining({
            resource: ResourceType.Asset,
            effectiveSyncEvery: 600,
            isOverridden: true,
            isDue: true,
          }),
        ],
      },
    ]);
  });

  it("falls back to the platform default cadence and is due with no nextSyncAt", async () => {
    mockPrisma.integration.count.mockResolvedValue(1);
    mockPrisma.integration.findMany.mockResolvedValue([
      integrationRow(null, null),
    ]);

    const result = await caller.getMany({ search: "partner" });

    expect(result.items[0].resourceSyncs[0]).toMatchObject({
      effectiveSyncEvery: 900,
      isOverridden: false,
      isDue: true,
    });
  });

  it("returns each integration's categories from the platform's own definition", async () => {
    mockCategoriesFor.mockReturnValue([
      "Vulnerability Management Platforms",
      "Notifications",
    ]);
    mockPrisma.integration.count.mockResolvedValue(1);
    mockPrisma.integration.findMany.mockResolvedValue([
      {
        id: "integration-1",
        name: "AI Vuln Crawler",
        platform: PlatformEnum.AI,
        syncEvery: null,
        config: {},
        enabled: true,
        resourceSyncs: [],
      },
    ]);

    const result = await caller.getMany({ search: "" });

    expect(mockCategoriesFor).toHaveBeenCalledWith(PlatformEnum.AI);
    expect(result.items[0].categories).toEqual([
      "Vulnerability Management Platforms",
      "Notifications",
    ]);
  });
});

describe("integrationsRouter enable controls", () => {
  it("updates the whole integration without requiring its full config", async () => {
    mockPrisma.integration.findUnique.mockResolvedValue(existingIntegration);

    await caller.setEnabled({ id: "integration-1", enabled: false });

    expect(mockPrisma.integration.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "integration-1" },
        data: { enabled: false },
      }),
    );
  });

  it("404s instead of 500ing when the integration doesn't exist", async () => {
    mockPrisma.integration.findUnique.mockResolvedValue(null);

    await expect(
      caller.setEnabled({ id: "missing", enabled: false }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(mockPrisma.integration.update).not.toHaveBeenCalled();
  });

  it("updates only the selected resource feed", async () => {
    mockPrisma.integrationResourceSync.findUnique.mockResolvedValue({
      integrationId: "integration-1",
    });

    await caller.setResourceSyncEnabled({
      integrationId: "integration-1",
      resource: ResourceType.Asset,
      enabled: false,
    });

    expect(mockPrisma.integrationResourceSync.update).toHaveBeenCalledWith({
      where: {
        integrationId_resource: {
          integrationId: "integration-1",
          resource: ResourceType.Asset,
        },
      },
      data: { enabled: false },
    });
  });

  it("404s instead of 500ing when the resource sync doesn't exist", async () => {
    mockPrisma.integrationResourceSync.findUnique.mockResolvedValue(null);

    await expect(
      caller.setResourceSyncEnabled({
        integrationId: "missing",
        resource: ResourceType.Asset,
        enabled: false,
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(mockPrisma.integrationResourceSync.update).not.toHaveBeenCalled();
  });
});

describe("integrationsRouter.update", () => {
  const baseData = {
    name: "Partner feed",
    platform: PlatformEnum.PARTNER,
    syncEvery: 600,
    config: {
      resource: ResourceType.Asset,
      integrationUri: "https://partner.example",
    },
  };

  beforeEach(() => {
    mockPrisma.integration.findUnique.mockResolvedValue(existingIntegration);
    mockPrisma.integration.update.mockResolvedValue({
      id: "integration-1",
      integrationUserId: null,
    });
  });

  it("keeps stored credentials untouched and applies a provided syncEvery", async () => {
    await caller.update({ id: "integration-1", data: baseData });

    const call = mockPrisma.integration.update.mock.calls[0][0];
    expect(call.data).not.toHaveProperty("credentials");
    expect(call.data.syncEvery).toBe(600);
  });

  it("re-encrypts credentials when they're provided", async () => {
    await caller.update({
      id: "integration-1",
      data: {
        ...baseData,
        credentials: { authType: "Bearer", authentication: { token: "abc" } },
      },
    });

    const call = mockPrisma.integration.update.mock.calls[0][0];
    expect(call.data.credentials).toBeInstanceOf(Uint8Array);
  });

  it("keeps the stored syncEvery (including a null 'inherit default') untouched when omitted", async () => {
    const { syncEvery: _syncEvery, ...dataWithoutSyncEvery } = baseData;

    await caller.update({ id: "integration-1", data: dataWithoutSyncEvery });

    const call = mockPrisma.integration.update.mock.calls[0][0];
    expect(call.data).not.toHaveProperty("syncEvery");
  });

  it("404s instead of 500ing when the integration doesn't exist", async () => {
    mockPrisma.integration.findUnique.mockResolvedValue(null);

    await expect(
      caller.update({ id: "missing", data: baseData }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(mockPrisma.integration.update).not.toHaveBeenCalled();
  });

  it("ignores a platform sent by the client, keeping the one actually stored", async () => {
    await caller.update({
      id: "integration-1",
      data: { ...baseData, platform: PlatformEnum.AI },
    });

    const call = mockPrisma.integration.update.mock.calls[0][0];
    expect(call.data.platform).toBe(PlatformEnum.PARTNER);
  });

  it("merges one dirty field into the existing credentials, preserving the rest", async () => {
    const existingBlob = encryptCredentials({
      authType: "Basic",
      authentication: { username: "alice", password: "old-pw" },
    });
    // requireIntegration's existence check, then the credentials fetch —
    // two separate findUnique calls with different selects.
    mockPrisma.integration.findUnique
      .mockResolvedValueOnce(existingIntegration)
      .mockResolvedValueOnce({ credentials: existingBlob });

    await caller.update({
      id: "integration-1",
      data: {
        ...baseData,
        credentials: {
          authType: "Basic",
          authentication: { password: "new-pw" },
        },
      },
    });

    const call = mockPrisma.integration.update.mock.calls[0][0];
    expect(decryptCredentials(call.data.credentials)).toEqual({
      authType: "Basic",
      authentication: { username: "alice", password: "new-pw" },
    });
  });

  it("requires the new auth type's fields when switching away from what's stored", async () => {
    const existingBlob = encryptCredentials({
      authType: "Bearer",
      authentication: { token: "real-token" },
    });
    mockPrisma.integration.findUnique
      .mockResolvedValueOnce(existingIntegration)
      .mockResolvedValueOnce({ credentials: existingBlob });

    await expect(
      caller.update({
        id: "integration-1",
        data: { ...baseData, credentials: { authType: "Basic" } },
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(mockPrisma.integration.update).not.toHaveBeenCalled();
  });

  it("does not force a resource sync back on — that's setResourceSyncEnabled's job", async () => {
    await caller.update({ id: "integration-1", data: baseData });

    const call = mockPrisma.integration.update.mock.calls[0][0];
    expect(call.data.resourceSyncs.upsert).toEqual([
      expect.objectContaining({
        where: {
          integrationId_resource: {
            integrationId: "integration-1",
            resource: ResourceType.Asset,
          },
        },
        create: { resource: ResourceType.Asset },
        update: {},
      }),
    ]);
  });
});

describe("integrationsRouter.remove", () => {
  it("removes an existing integration", async () => {
    mockPrisma.integration.findUnique.mockResolvedValue(existingIntegration);

    await caller.remove({ id: "integration-1" });

    expect(mockPrisma.integration.delete).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "integration-1" } }),
    );
  });

  it("404s instead of 500ing when the integration doesn't exist", async () => {
    mockPrisma.integration.findUnique.mockResolvedValue(null);

    await expect(caller.remove({ id: "missing" })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    expect(mockPrisma.integration.delete).not.toHaveBeenCalled();
  });
});

describe("integrationsRouter.triggerSync", () => {
  it("enqueues one event for each enabled resource feed", async () => {
    mockPrisma.integration.findFirst.mockResolvedValue({
      id: "integration-1",
      resourceSyncs: [
        { resource: ResourceType.Asset },
        { resource: ResourceType.WorkOrder },
      ],
    });

    await expect(caller.triggerSync({ id: "integration-1" })).resolves.toEqual({
      success: true,
    });

    expect(mockInngest.send).toHaveBeenCalledWith([
      {
        name: "integration/sync.requested",
        data: {
          integrationId: "integration-1",
          resource: ResourceType.Asset,
        },
      },
      {
        name: "integration/sync.requested",
        data: {
          integrationId: "integration-1",
          resource: ResourceType.WorkOrder,
        },
      },
    ]);
  });

  it("does not enqueue work for a disabled integration", async () => {
    mockPrisma.integration.findFirst.mockResolvedValue(null);

    await expect(
      caller.triggerSync({ id: "integration-1" }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });

    expect(mockPrisma.integration.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "integration-1", enabled: true },
      }),
    );
    expect(mockInngest.send).not.toHaveBeenCalled();
  });

  it("does not report success when every resource feed is disabled", async () => {
    mockPrisma.integration.findFirst.mockResolvedValue({
      id: "integration-1",
      resourceSyncs: [],
    });

    await expect(
      caller.triggerSync({ id: "integration-1" }),
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: "No enabled resources to sync",
    });
    expect(mockInngest.send).not.toHaveBeenCalled();
  });
});
