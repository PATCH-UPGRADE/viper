// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    user: { findUnique: vi.fn() },
    assetTicket: { findMany: vi.fn() },
    workOrderTicket: { findFirst: vi.fn() },
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

describe("interruption detail contact", () => {
  const person = (phone: string | null) => ({
    name: "Dana",
    email: "dana@example.com",
    phone,
    department: null,
  });
  const detailFor = async (assignee: ReturnType<typeof person>) => {
    mockPrisma.user.findUnique.mockResolvedValue({ departmentId: "dept-A" });
    mockPrisma.workOrderTicket.findFirst.mockResolvedValue({
      id: "wo-1",
      assignee,
      creator: person(null),
      ticket: null,
      seenBy: [],
      departments: [],
      assets: [],
      descriptions: [],
      comments: [],
      activities: [],
    });
    return getInterruptionDetail("u1", "wo-1");
  };

  it("returns the contact's phone, or null without one", async () => {
    expect((await detailFor(person("Ext. 3104"))).contact.phone).toBe(
      "Ext. 3104",
    );
    expect((await detailFor(person(null))).contact.phone).toBeNull();
  });

  it("selects the phone of the assignee and the creator", async () => {
    await detailFor(person(null));
    const { select } = mockPrisma.workOrderTicket.findFirst.mock.calls[0][0];
    expect(select.assignee.select.phone).toBe(true);
    expect(select.creator.select.phone).toBe(true);
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
