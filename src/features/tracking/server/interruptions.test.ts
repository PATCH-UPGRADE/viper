// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    user: { findUnique: vi.fn() },
    assetTicket: { findMany: vi.fn() },
    workOrderTicket: { findFirst: vi.fn(), findMany: vi.fn() },
  },
}));

vi.mock("@/lib/db", () => ({ default: mockPrisma }));

import {
  getInterruptionCalendar,
  getInterruptionDetail,
  getInterruptionList,
} from "./interruptions";

const range = { from: new Date(2026, 2, 1), to: new Date(2026, 2, 7) };

beforeEach(() => {
  vi.resetAllMocks();
  mockPrisma.assetTicket.findMany.mockResolvedValue([]);
});

describe("interruptions scope", () => {
  it("shows a user with no department nothing, without querying", async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ departmentId: null });
    await expect(getInterruptionCalendar("u1", range)).resolves.toEqual([]);
    expect(mockPrisma.assetTicket.findMany).not.toHaveBeenCalled();
  });

  it("hides the details of a ticket outside the department", async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ departmentId: "dept-A" });
    mockPrisma.workOrderTicket.findFirst.mockResolvedValue(null);
    await expect(getInterruptionDetail("u1", "other")).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });
});

describe("interruption calendar", () => {
  it("counts the devices on an owner event and gives a device event one", async () => {
    const ownerTime = new Date(2026, 2, 3, 9);
    mockPrisma.user.findUnique.mockResolvedValue({ departmentId: "dept-A" });
    mockPrisma.workOrderTicket.findMany.mockResolvedValue([
      {
        id: "owner",
        summary: "Patch pumps",
        status: "TO_DO",
        category: "PATCH",
        scheduledAt: ownerTime,
        scheduledEndTime: null,
        seenBy: [],
        assets: [{ id: "a1" }, { id: "a2" }],
      },
    ]);
    mockPrisma.assetTicket.findMany.mockResolvedValue([
      {
        parentTicketId: "owner",
        parentTicket: {
          id: "owner",
          summary: "Patch pumps",
          scheduledAt: ownerTime,
          scheduledEndTime: null,
        },
        asset: { id: "a3", hostname: "pump-3" },
        ticket: {
          id: "t3",
          status: "TO_DO",
          category: "PATCH",
          scheduledAt: new Date(2026, 2, 4, 9),
        },
      },
    ]);
    const events = await getInterruptionCalendar("u1", range);
    expect(events.map((event) => event.deviceCount)).toEqual([2, 1]);
  });
});

describe("interruption list", () => {
  it("puts a device ticket without a time on its owner's schedule", async () => {
    const ownerTime = new Date(2026, 2, 3, 9);
    mockPrisma.user.findUnique.mockResolvedValue({ departmentId: "dept-A" });
    mockPrisma.assetTicket.findMany.mockResolvedValue([
      {
        parentTicketId: "owner",
        parentTicket: {
          id: "owner",
          summary: "Patch pumps",
          scheduledAt: ownerTime,
          scheduledEndTime: null,
          seenBy: [],
        },
        asset: { id: "a1", hostname: "pump-1" },
        ticket: {
          id: "t1",
          summary: "s",
          status: "TO_DO",
          category: "PATCH",
          scheduledAt: null,
        },
      },
    ]);
    const [item] = await getInterruptionList("u1");
    expect(item.scheduledAt).toEqual(ownerTime);
  });
});
