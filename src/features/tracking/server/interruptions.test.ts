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
} from "./interruptions";

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
      AND: [
        {
          asset: { managedBy: { some: { departmentId: "dept-A" } } },
          parentTicket: open,
          ticket: open,
        },
        { ticket: { scheduledAt: { gte: range.from, lte: range.to } } },
      ],
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

describe("getInterruptionDetail", () => {
  it("rejects a ticket outside the department's scope", async () => {
    asUser("dept-A");
    mockPrisma.workOrderTicket.findFirst.mockResolvedValue(null);

    await expect(getInterruptionDetail("u1", "other")).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    const open = { isDraft: false, status: { not: "DONE" } };
    expect(mockPrisma.workOrderTicket.findFirst.mock.calls[0][0].where).toEqual(
      {
        id: "other",
        ticket: {
          asset: { managedBy: { some: { departmentId: "dept-A" } } },
          parentTicket: open,
          ticket: open,
        },
      },
    );
  });

  it("rejects a user with no department without querying", async () => {
    asUser(null);
    await expect(getInterruptionDetail("u1", "c1")).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    expect(mockPrisma.workOrderTicket.findFirst).not.toHaveBeenCalled();
  });

  it("assembles contact, reason and remediation, falling back to the work order's", async () => {
    asUser("dept-A");
    const found = (overrides = {}) => ({
      body: "Ticket body",
      assignee: null,
      creator: { name: "Creator Cam" },
      descriptions: [],
      remediations: [],
      comments: [{ id: "k1" }],
      ticket: {
        parentTicket: {
          descriptions: [{ body: "Work order reason" }],
          remediations: [{ id: "r-parent" }],
        },
      },
      ...overrides,
    });

    mockPrisma.workOrderTicket.findFirst.mockResolvedValueOnce(found());
    await expect(getInterruptionDetail("u1", "c1")).resolves.toEqual({
      comments: [{ id: "k1" }],
      contactName: "Creator Cam",
      whyNecessary: "Work order reason",
      remediations: [{ id: "r-parent" }],
    });

    // The ticket's own assignee, description and remediation win.
    mockPrisma.workOrderTicket.findFirst.mockResolvedValueOnce(
      found({
        assignee: { name: "Assignee Al" },
        descriptions: [{ body: "Own reason" }],
        remediations: [{ id: "r-own" }],
      }),
    );
    await expect(getInterruptionDetail("u1", "c1")).resolves.toMatchObject({
      contactName: "Assignee Al",
      whyNecessary: "Own reason",
      remediations: [{ id: "r-own" }],
    });
  });
});
