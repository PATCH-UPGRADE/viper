// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    user: { findUnique: vi.fn() },
    asset: { findFirst: vi.fn() },
    assetTicket: { findMany: vi.fn() },
  },
}));

vi.mock("@/lib/db", () => ({ default: mockPrisma }));

import { getInterruptionCalendar } from "./interruptions";

const range = { from: new Date(2026, 2, 1), to: new Date(2026, 2, 7) };
const asUser = (departmentId: string | null) =>
  mockPrisma.user.findUnique.mockResolvedValue({ departmentId });

beforeEach(() => {
  vi.resetAllMocks();
  mockPrisma.assetTicket.findMany.mockResolvedValue([]);
});

describe("getInterruptionCalendar", () => {
  it("gives a user with no department nothing", async () => {
    asUser(null);
    await expect(getInterruptionCalendar("u1", range)).resolves.toEqual({
      scope: "no-department",
      items: [],
    });
    expect(mockPrisma.assetTicket.findMany).not.toHaveBeenCalled();
  });

  it("says so when the department manages no assets", async () => {
    asUser("dept-A");
    mockPrisma.asset.findFirst.mockResolvedValue(null);
    await expect(getInterruptionCalendar("u1", range)).resolves.toMatchObject({
      scope: "no-assets",
    });
  });

  it("asks only for the department's own open device tickets in the range, and maps them", async () => {
    asUser("dept-A");
    const at = new Date(2026, 2, 3, 9);
    mockPrisma.assetTicket.findMany.mockResolvedValue([
      {
        asset: {
          id: "a1",
          hostname: "pump-1",
          ip: null,
          serialNumber: null,
          role: null,
        },
        ticket: {
          id: "c1",
          summary: "Patch pump-1",
          status: "TO_DO",
          scheduledAt: at,
          durationEstimate: 45,
        },
      },
    ]);

    const result = await getInterruptionCalendar("u1", range);

    const open = { isDraft: false, status: { not: "DONE" } };
    expect(mockPrisma.assetTicket.findMany.mock.calls[0][0].where).toEqual({
      asset: { managedBy: { some: { departmentId: "dept-A" } } },
      parentTicket: open,
      ticket: { ...open, scheduledAt: { gte: range.from, lte: range.to } },
    });
    expect(result).toEqual({
      scope: "ready",
      items: [
        {
          id: "c1",
          summary: "Patch pump-1",
          status: "TO_DO",
          scheduledAt: at,
          durationEstimate: 45,
          assetName: "pump-1",
        },
      ],
    });
  });
});
