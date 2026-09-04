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
      workOrderTicket: { count: vi.fn() },
    },
  }));

vi.mock("@/lib/db", () => ({ default: mockPrisma }));
vi.mock("@/inngest/client", () => ({ inngest: mockInngest }));
vi.mock("../core/registry", () => ({
  defaultSyncEveryFor: mockDefaultSyncEveryFor,
  displayNameFor: () => "Partner API",
  categoriesFor: mockCategoriesFor,
}));

import { PlatformEnum, ResourceType } from "@/generated/prisma";
import { createCallerFactory } from "@/trpc/init";
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
  enabled: true,
  resourceSyncs: [
    {
      resource: ResourceType.Asset,
      nextSyncAt,
      syncEvery: null,
    },
  ],
});
const existingIntegration = { id: "integration-1" };

mockDefaultSyncEveryFor.mockReturnValue(900);
mockCategoriesFor.mockReturnValue([]);
beforeEach(() => vi.clearAllMocks());

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

describe("integrationsRouter.remove", () => {
  it("removes an existing integration", async () => {
    mockPrisma.integration.findUnique.mockResolvedValue(existingIntegration);
    mockPrisma.workOrderTicket.count.mockResolvedValue(0);

    await caller.remove({ id: "integration-1" });

    expect(mockPrisma.integration.delete).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "integration-1" } }),
    );
  });

  it("refuses while a work order is being filed on it", async () => {
    // Deleting mid-flight would pull the row the submission job authenticates
    // against, failing a batch it has already partly filed.
    mockPrisma.integration.findUnique.mockResolvedValue(existingIntegration);
    mockPrisma.workOrderTicket.count.mockResolvedValue(2);

    await expect(caller.remove({ id: "integration-1" })).rejects.toMatchObject({
      code: "CONFLICT",
    });
    expect(mockPrisma.integration.delete).not.toHaveBeenCalled();
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
