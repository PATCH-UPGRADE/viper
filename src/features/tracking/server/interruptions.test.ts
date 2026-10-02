// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    user: { findUnique: vi.fn() },
    asset: { findFirst: vi.fn() },
    workOrderTicket: { findFirst: vi.fn() },
    assetTicket: { findMany: vi.fn() },
  },
}));

vi.mock("@/lib/db", () => ({ default: mockPrisma }));

import { getInterruptionCalendar } from "./interruptions";

const USER = "user-1";
const DEPT = "dept-A";
const range = { from: new Date(2026, 2, 1), to: new Date(2026, 2, 7) };

const asUser = (departmentId: string | null, managesAssets = true) => {
  mockPrisma.user.findUnique.mockResolvedValue({ departmentId });
  mockPrisma.asset.findFirst.mockResolvedValue(
    managesAssets ? { id: "a1" } : null,
  );
};

const asset = (id: string, hostname: string) => ({
  id,
  hostname,
  ip: null,
  serialNumber: null,
  role: null,
});

// One AssetTicket row, as the calendar and list queries select it.
const row = (id: string, hostname: string, ticket = {}) => ({
  parentTicketId: "p1",
  parentTicket: { id: "p1", summary: "Patch pumps" },
  asset: asset(`asset-${id}`, hostname),
  ticket: {
    id,
    summary: `Patch pumps — ${hostname}`,
    status: "TO_DO",
    scheduledAt: new Date(2026, 2, 3, 9),
    durationEstimate: null,
    lastCommentAt: null,
    seenBy: [],
    ...ticket,
  },
});

const open = { isDraft: false, status: { not: "DONE" } };
const scope = {
  asset: { managedBy: { some: { departmentId: DEPT } } },
  ticket: open,
  parentTicket: open,
};

beforeEach(() => {
  vi.resetAllMocks();
  mockPrisma.assetTicket.findMany.mockResolvedValue([]);
});

describe("scope", () => {
  it("gives a user with no department nothing", async () => {
    asUser(null);
    await expect(getInterruptionCalendar(USER, range)).resolves.toMatchObject({
      scope: "no-department",
      items: [],
    });
    expect(mockPrisma.assetTicket.findMany).not.toHaveBeenCalled();
  });

  it("says so when the department manages no assets", async () => {
    asUser(DEPT, false);
    await expect(getInterruptionCalendar(USER, range)).resolves.toMatchObject({
      scope: "no-assets",
    });
  });

  it("includes only devices the department manages, and hides DONE and drafts", async () => {
    asUser(DEPT);
    await getInterruptionCalendar(USER, range);

    const [calendarCall] = mockPrisma.assetTicket.findMany.mock.calls;
    expect(calendarCall[0].where.AND[0]).toEqual(scope);
  });
});

describe("queries", () => {
  it("returns calendar items in time order, unread until opened", async () => {
    asUser(DEPT);
    const late = new Date(2026, 2, 3, 9);
    const early = new Date(2026, 2, 3, 8);
    mockPrisma.assetTicket.findMany.mockResolvedValue([
      row("c1", "pump-1", { scheduledAt: late, seenBy: [{ seenAt: late }] }),
      row("c2", "pump-2", { scheduledAt: early, durationEstimate: 45 }),
    ]);

    const { items, assetTicketCount } = await getInterruptionCalendar(
      USER,
      range,
    );

    expect(assetTicketCount).toBe(2);
    expect(
      items.map((i) => [i.id, i.assetName, i.durationEstimate, i.unread]),
    ).toEqual([
      ["c2", "pump-2", 45, true],
      ["c1", "pump-1", null, false],
    ]);
  });
});
