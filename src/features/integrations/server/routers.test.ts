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
      update: vi.fn(),
    },
    integrationResourceSync: { update: vi.fn() },
  },
}));

vi.mock("@/lib/db", () => ({ default: mockPrisma }));
vi.mock("@/inngest/client", () => ({ inngest: mockInngest }));
vi.mock("../core/registry", () => ({
  defaultSyncEveryFor: mockDefaultSyncEveryFor,
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
});

describe("integrationsRouter enable controls", () => {
  it("updates the whole integration without requiring its full config", async () => {
    mockPrisma.integration.update.mockResolvedValue({ id: "integration-1" });

    await setup().setEnabled({ id: "integration-1", enabled: false });

    expect(mockPrisma.integration.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "integration-1" },
        data: { enabled: false },
      }),
    );
  });

  it("updates only the selected resource feed", async () => {
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
