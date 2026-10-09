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

  it("gives the contact's phone", async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ departmentId: "dept-A" });
    mockPrisma.workOrderTicket.findFirst.mockResolvedValue({
      id: "wo-1",
      assignee: { phone: "Ext. 3104" },
      ticket: null,
      seenBy: [],
      departments: [],
      assets: [],
      descriptions: [],
    });
    const detail = await getInterruptionDetail("u1", "wo-1");
    const { select } = mockPrisma.workOrderTicket.findFirst.mock.calls[0][0];
    expect(select.assignee.select.phone).toBe(true);
    expect(detail.contact.phone).toBe("Ext. 3104");
  });
});

describe("interruption calendar", () => {
  const ownerTime = new Date(2026, 2, 3, 9);
  const otherDay = new Date(2026, 2, 4, 9);
  // An asset with a device type that has this icon, or none.
  const asset = (icon: string | null) => ({
    id: "a",
    hostname: "pump",
    deviceGroup: {
      product: icon ? { deviceType: { displayName: "Pump", icon } } : null,
    },
  });
  const ownerEvent = (devices: { at: Date | null; icon: string | null }[]) => ({
    id: "owner",
    summary: "Patch pumps",
    status: "TO_DO",
    category: "PATCH",
    scheduledAt: ownerTime,
    scheduledEndTime: null,
    seenBy: [],
    assets: devices.map(({ at, icon }) => ({
      asset: asset(icon),
      ticket: { scheduledAt: at },
    })),
  });

  beforeEach(() => {
    mockPrisma.user.findUnique.mockResolvedValue({ departmentId: "dept-A" });
  });

  it("counts only the devices on the owner's time, and gives a rescheduled device its own event", async () => {
    mockPrisma.workOrderTicket.findMany.mockResolvedValue([
      ownerEvent([
        { at: null, icon: "Syringe" },
        { at: ownerTime, icon: "Syringe" },
        { at: otherDay, icon: "Activity" },
      ]),
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
        asset: asset("Activity"),
        ticket: {
          id: "t3",
          status: "TO_DO",
          category: "PATCH",
          scheduledAt: otherDay,
        },
      },
    ]);
    const events = await getInterruptionCalendar("u1", range);
    expect(events.map((event) => event.deviceCount)).toEqual([2, 1]);
    expect(events[0].assetName).toBe("2 devices");
    // The rescheduled device's icon is its own, and not the owner event's.
    expect(events.map((event) => event.icon)).toEqual(["Syringe", "Activity"]);
  });

  it("shows no icon when the devices differ in type, or one has none", async () => {
    mockPrisma.workOrderTicket.findMany.mockResolvedValue([
      ownerEvent([
        { at: null, icon: "Syringe" },
        { at: null, icon: "Activity" },
      ]),
      ownerEvent([
        { at: null, icon: "Syringe" },
        { at: null, icon: null },
      ]),
    ]);
    const events = await getInterruptionCalendar("u1", range);
    expect(events.map((event) => event.icon)).toEqual([null, null]);
  });

  it("drops the owner's event when every device is on another day", async () => {
    mockPrisma.workOrderTicket.findMany.mockResolvedValue([
      ownerEvent([{ at: otherDay, icon: null }]),
    ]);
    await expect(getInterruptionCalendar("u1", range)).resolves.toEqual([]);
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
