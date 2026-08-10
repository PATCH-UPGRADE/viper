// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    deviceGroup: { findMany: vi.fn() },
    notification: { findMany: vi.fn() },
    ticketActivity: { findMany: vi.fn() },
    asset: { findMany: vi.fn(), count: vi.fn() },
    workOrderTicket: { findMany: vi.fn() },
  },
}));

vi.mock("@/lib/db", () => ({ default: mockPrisma }));

import { createCallerFactory } from "@/trpc/init";
import { overviewRouter } from "./routers";

const createCaller = createCallerFactory(overviewRouter);
const caller = createCaller({
  // biome-ignore lint/suspicious/noExplicitAny: test fixture
  auth: { user: { id: "user-test" } } as any,
  // biome-ignore lint/suspicious/noExplicitAny: test fixture
} as any);

const OWNED = {
  id: "dg-owned",
  manufacturerId: "mfr-1",
  productId: "prod-1",
  versionId: null,
  version: null,
  _count: { assets: 4 },
};

/** Matching that resolves to OWNED: same manufacturer + product, no version pin. */
const ownedMatching = {
  confidence: "Matched",
  deviceGroupMatching: {
    manufacturerId: "mfr-1",
    productId: "prod-1",
    versionId: null,
    versionRange: null,
  },
};

/** Matching for a manufacturer that owns nothing in the inventory. */
const unownedMatching = {
  confidence: "Matched",
  deviceGroupMatching: {
    manufacturerId: "mfr-absent",
    productId: null,
    versionId: null,
    versionRange: null,
  },
};

const notification = (
  id: string,
  type: string,
  matchings: unknown[],
  // biome-ignore lint/suspicious/noExplicitAny: test fixture
): any => ({
  id,
  title: `${id} title`,
  summary: null,
  type,
  priority: "High",
  createdAt: new Date(),
  deviceGroupsMatchings: matchings,
});

describe("overview.recentUpdates", () => {
  beforeEach(() => {
    mockPrisma.deviceGroup.findMany.mockResolvedValue([]);
    mockPrisma.notification.findMany.mockResolvedValue([]);
    mockPrisma.ticketActivity.findMany.mockResolvedValue([]);
    mockPrisma.asset.findMany.mockResolvedValue([]);
  });

  it("keeps notifications whose matchings resolve to owned assets and drops the rest", async () => {
    mockPrisma.deviceGroup.findMany.mockResolvedValue([OWNED]);
    mockPrisma.notification.findMany.mockResolvedValue([
      notification("kept", "Advisory", [ownedMatching]),
      notification("dropped", "Advisory", [unownedMatching]),
      notification("no-matchings", "Advisory", []),
      notification("recall", "Recall", [ownedMatching]),
    ]);

    const result = await caller.recentUpdates();

    expect(result.advisories.count).toBe(1);
    expect(result.advisories.items[0].id).toBe("kept");
    expect(result.advisories.items[0].assetCount).toBe(4);
    expect(result.recalls.count).toBe(1);
  });

  it("does not query UpdateAvailable — the card has no chip for it", async () => {
    await caller.recentUpdates();

    expect(mockPrisma.notification.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          type: { in: ["Advisory", "Recall"] },
        }),
      }),
    );
  });

  it("windows every query to the same point exactly 24 hours back", async () => {
    const now = new Date("2026-08-10T12:00:00.000Z");
    vi.useFakeTimers();
    vi.setSystemTime(now);

    try {
      await caller.recentUpdates();
    } finally {
      vi.useRealTimers();
    }

    const since = new Date("2026-08-09T12:00:00.000Z");
    const windowed = expect.objectContaining({
      where: expect.objectContaining({ createdAt: { gte: since } }),
    });

    // All three date-filtered queries must share one cutoff, or the chip
    // counts would describe different windows.
    expect(mockPrisma.notification.findMany).toHaveBeenCalledWith(windowed);
    expect(mockPrisma.ticketActivity.findMany).toHaveBeenCalledWith(windowed);
    expect(mockPrisma.asset.findMany).toHaveBeenCalledWith(windowed);
  });

  it("ignores a matching the user rejected", async () => {
    mockPrisma.deviceGroup.findMany.mockResolvedValue([OWNED]);
    mockPrisma.notification.findMany.mockResolvedValue([
      notification("rejected", "Advisory", [
        { ...ownedMatching, confidence: "Rejected" },
      ]),
    ]);

    const result = await caller.recentUpdates();

    expect(result.advisories.count).toBe(0);
  });

  it("collapses repeated status changes to the latest per ticket", async () => {
    // Newest first, as the router orders them.
    mockPrisma.ticketActivity.findMany.mockResolvedValue([
      {
        id: "a2",
        data: { from: "IN_PROGRESS", to: "DONE" },
        createdAt: new Date("2026-08-05T10:00:00Z"),
        ticket: { id: "t1", summary: "Patch pumps" },
      },
      {
        id: "a1",
        data: { from: "TO_DO", to: "IN_PROGRESS" },
        createdAt: new Date("2026-08-05T09:00:00Z"),
        ticket: { id: "t1", summary: "Patch pumps" },
      },
    ]);

    const result = await caller.recentUpdates();

    expect(result.workOrders.count).toBe(1);
    expect(result.workOrders.items[0]).toMatchObject({
      id: "t1",
      from: "IN_PROGRESS",
      to: "DONE",
    });
  });

  it("counts new assets individually but lists them collapsed by model", async () => {
    const monitor = {
      id: "dg-1",
      manufacturer: { canonicalDisplayName: "GE" },
      product: { canonicalDisplayName: "CARESCAPE B650" },
    };
    const fleet = [{ integration: { name: "teamplay Fleet" } }];
    mockPrisma.asset.findMany.mockResolvedValue([
      {
        id: "a1",
        createdAt: new Date(),
        deviceGroup: monitor,
        externalMappings: fleet,
      },
      {
        id: "a2",
        createdAt: new Date(),
        deviceGroup: monitor,
        externalMappings: fleet,
      },
      {
        id: "a3",
        createdAt: new Date(),
        deviceGroup: monitor,
        externalMappings: fleet,
      },
      {
        id: "a4",
        createdAt: new Date(),
        deviceGroup: {
          id: "dg-2",
          manufacturer: { canonicalDisplayName: "Mindray" },
          product: { canonicalDisplayName: "Resona 7" },
        },
        externalMappings: [],
      },
    ]);

    const result = await caller.recentUpdates();

    expect(result.newAssets.count).toBe(4);
    expect(result.newAssets.items).toEqual([
      {
        key: "dg-1:teamplay Fleet",
        label: "GE CARESCAPE B650",
        source: "teamplay Fleet",
        count: 3,
      },
      { key: "dg-2:", label: "Mindray Resona 7", source: null, count: 1 },
    ]);
    expect(result.totalCount).toBe(4);
  });
});
