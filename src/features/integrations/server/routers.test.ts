// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { mockDefaultSyncEveryFor, mockInngest, mockPrisma } = vi.hoisted(() => ({
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
  },
}));

vi.mock("@/lib/db", () => ({ default: mockPrisma }));
vi.mock("@/inngest/client", () => ({ inngest: mockInngest }));
vi.mock("../core/registry", () => ({
  defaultSyncEveryFor: mockDefaultSyncEveryFor,
  displayNameFor: (platform: string) => platform,
  requirePlatform: vi.fn(),
}));

import { PlatformEnum, ResourceType, SyncStatusEnum } from "@/generated/prisma";
import { createCallerFactory } from "@/trpc/init";
import { integrationsRouter } from "./routers";

const createCaller = createCallerFactory(integrationsRouter);
const setup = () =>
  createCaller({ req: undefined, auth: { user: { id: "user-test" } } });
const PAGE_INPUT = {
  page: 1,
  pageSize: 10,
  search: "partner",
  sort: "",
  lastUpdatedStartTime: "",
  lastUpdatedEndTime: "",
} as const;

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.integration.count.mockResolvedValue(0);
  mockDefaultSyncEveryFor.mockReturnValue(900);
});

describe("integrationsRouter.getMany", () => {
  it("returns one unified, browser-safe list with resolved resource cadences", async () => {
    mockPrisma.integration.count.mockResolvedValue(1);
    mockPrisma.integration.findMany.mockResolvedValue([
      {
        id: "integration-1",
        name: "Partner feed",
        platform: PlatformEnum.PARTNER,
        syncEvery: 600,
        enabled: true,
        resourceSyncs: [
          {
            integrationId: "integration-1",
            resource: ResourceType.Asset,
            status: SyncStatusEnum.Success,
            errorMessage: null,
            lastSuccessfulSync: null,
            nextSyncAt: new Date(Date.now() - 1_000),
            enabled: true,
            syncEvery: null,
          },
        ],
      },
    ]);

    const result = await setup().getMany(PAGE_INPUT);

    expect(mockPrisma.integration.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { name: { contains: "partner", mode: "insensitive" } },
        select: {
          id: true,
          name: true,
          platform: true,
          syncEvery: true,
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
        platformLabel: PlatformEnum.PARTNER,
        enabled: true,
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

  it("falls back to the platform default cadence and isn't due with no nextSyncAt", async () => {
    mockPrisma.integration.count.mockResolvedValue(1);
    mockPrisma.integration.findMany.mockResolvedValue([
      {
        id: "integration-1",
        name: "Partner feed",
        platform: PlatformEnum.PARTNER,
        syncEvery: null,
        enabled: true,
        resourceSyncs: [
          {
            integrationId: "integration-1",
            resource: ResourceType.Asset,
            status: SyncStatusEnum.Success,
            errorMessage: null,
            lastSuccessfulSync: null,
            nextSyncAt: null,
            enabled: true,
            syncEvery: null,
          },
        ],
      },
    ]);

    const result = await setup().getMany(PAGE_INPUT);

    expect(result.items[0].resourceSyncs[0]).toMatchObject({
      effectiveSyncEvery: 900,
      isOverridden: false,
      isDue: false,
    });
  });
});

describe("integrationsRouter enable controls", () => {
  it("updates the whole integration without requiring its full config", async () => {
    mockPrisma.integration.findUnique.mockResolvedValue({
      id: "integration-1",
    });
    mockPrisma.integration.update.mockResolvedValue({ id: "integration-1" });

    await setup().setEnabled({ id: "integration-1", enabled: false });

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
      setup().setEnabled({ id: "missing", enabled: false }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(mockPrisma.integration.update).not.toHaveBeenCalled();
  });

  it("updates only the selected resource feed", async () => {
    mockPrisma.integrationResourceSync.findUnique.mockResolvedValue({
      integrationId: "integration-1",
    });
    mockPrisma.integrationResourceSync.update.mockResolvedValue({});

    await setup().setResourceSyncEnabled({
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
      setup().setResourceSyncEnabled({
        integrationId: "missing",
        resource: ResourceType.Asset,
        enabled: false,
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(mockPrisma.integrationResourceSync.update).not.toHaveBeenCalled();
  });
});

describe("integrationsRouter.update", () => {
  it("404s instead of 500ing when the integration doesn't exist", async () => {
    mockPrisma.integration.findUnique.mockResolvedValue(null);

    await expect(
      setup().update({
        id: "missing",
        data: {
          name: "Partner feed",
          platform: PlatformEnum.PARTNER,
          syncEvery: 3600,
          config: {},
        },
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(mockPrisma.integration.update).not.toHaveBeenCalled();
  });
});

describe("integrationsRouter.remove", () => {
  it("removes an existing integration", async () => {
    mockPrisma.integration.findUnique.mockResolvedValue({
      id: "integration-1",
    });
    mockPrisma.integration.delete.mockResolvedValue({ id: "integration-1" });

    await setup().remove({ id: "integration-1" });

    expect(mockPrisma.integration.delete).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "integration-1" } }),
    );
  });

  it("404s instead of 500ing when the integration doesn't exist", async () => {
    mockPrisma.integration.findUnique.mockResolvedValue(null);

    await expect(setup().remove({ id: "missing" })).rejects.toMatchObject({
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

    await expect(setup().triggerSync({ id: "integration-1" })).resolves.toEqual(
      { success: true },
    );

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
      setup().triggerSync({ id: "integration-1" }),
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
      setup().triggerSync({ id: "integration-1" }),
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: "No enabled resources to sync",
    });
    expect(mockInngest.send).not.toHaveBeenCalled();
  });
});
