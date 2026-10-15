// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    user: { findUnique: vi.fn() },
    assetTicket: { findMany: vi.fn() },
    workOrderTicket: { findFirst: vi.fn(), findMany: vi.fn() },
    rescheduleRequest: { findFirst: vi.fn() },
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

  const detailTicket = (overrides = {}) => ({
    id: "wo-1",
    assignee: null,
    creator: { phone: null },
    ticket: null,
    seenBy: [],
    departments: [],
    assets: [],
    descriptions: [],
    rescheduleRequests: [],
    ...overrides,
  });

  it("gives the contact's phone", async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ departmentId: "dept-A" });
    mockPrisma.workOrderTicket.findFirst.mockResolvedValue(
      detailTicket({ assignee: { phone: "Ext. 3104" } }),
    );
    const detail = await getInterruptionDetail("u1", "wo-1");
    const { select } = mockPrisma.workOrderTicket.findFirst.mock.calls[0][0];
    expect(select.assignee.select.phone).toBe(true);
    expect(detail.contact.phone).toBe("Ext. 3104");
  });

  it("shows a pending request on the other side of an owner and its device", async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ departmentId: "dept-A" });
    mockPrisma.workOrderTicket.findFirst.mockResolvedValue(
      detailTicket({
        id: "dev-1",
        ticket: { parentTicket: detailTicket() },
      }),
    );
    const related = {
      proposedAt: new Date("2026-10-16T10:00:00Z"),
      requestedBy: { name: "Sam" },
    };
    mockPrisma.rescheduleRequest.findFirst.mockResolvedValue(related);

    const detail = await getInterruptionDetail("u1", "dev-1");

    expect(
      mockPrisma.rescheduleRequest.findFirst.mock.calls[0][0].where,
    ).toMatchObject({ ticketId: "wo-1" });
    expect(detail.relatedReschedule).toEqual({ ...related, onWorkOrder: true });
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
    rescheduleRequests: [],
    assets: devices.map(({ at, icon }) => ({
      asset: asset(icon),
      ticket: { scheduledAt: at, rescheduleRequests: [] as { id: string }[] },
    })),
  });

  // A device on another day than its owner, so it gets an event of its own.
  const deviceEvent = (ownerRequests: { id: string }[] = []) => ({
    parentTicketId: "owner",
    parentTicket: {
      id: "owner",
      summary: "Patch pumps",
      scheduledAt: ownerTime,
      scheduledEndTime: null,
      rescheduleRequests: ownerRequests,
    },
    asset: asset("Activity"),
    ticket: {
      id: "t3",
      status: "TO_DO",
      category: "PATCH",
      scheduledAt: otherDay,
      rescheduleRequests: [],
    },
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
    mockPrisma.assetTicket.findMany.mockResolvedValue([deviceEvent()]);
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

  it("marks an owner's event for a pending request on it or on a device, and a device's for its owner's", async () => {
    const pending = [{ id: "r1" }];
    const withDevice = (rescheduleRequests: { id: string }[]) => {
      const owner = ownerEvent([{ at: null, icon: null }]);
      owner.assets[0].ticket.rescheduleRequests = rescheduleRequests;
      return owner;
    };
    mockPrisma.workOrderTicket.findMany.mockResolvedValue([
      {
        ...ownerEvent([{ at: null, icon: null }]),
        rescheduleRequests: pending,
      },
      withDevice(pending),
      ownerEvent([{ at: null, icon: null }]),
    ]);
    const events = await getInterruptionCalendar("u1", range);
    expect(events.map((event) => event.reschedulePending)).toEqual([
      true,
      true,
      false,
    ]);

    mockPrisma.workOrderTicket.findMany.mockResolvedValue([]);
    mockPrisma.assetTicket.findMany.mockResolvedValue([deviceEvent(pending)]);
    const [device] = await getInterruptionCalendar("u1", range);
    expect(device.reschedulePending).toBe(true);
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
          rescheduleRequests: [],
        },
        asset: { id: "a1", hostname: "pump-1" },
        ticket: {
          id: "t1",
          summary: "s",
          status: "TO_DO",
          category: "PATCH",
          scheduledAt: null,
          rescheduleRequests: [],
        },
      },
    ]);
    const [item] = await getInterruptionList("u1");
    expect(item.scheduledAt).toEqual(ownerTime);
    expect(item.reschedulePending).toBe(false);
  });
});
