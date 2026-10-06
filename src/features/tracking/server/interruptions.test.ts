// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    user: { findUnique: vi.fn() },
    assetTicket: { findMany: vi.fn(), findFirst: vi.fn() },
    rescheduleRequest: { create: vi.fn() },
    workOrderTicket: { findFirst: vi.fn() },
  },
}));

vi.mock("@/lib/db", () => ({ default: mockPrisma }));

import {
  getInterruptionCalendar,
  getInterruptionDetail,
  requestReschedule,
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

  it("refuses a reschedule request for a ticket outside the department", async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ departmentId: "dept-A" });
    mockPrisma.assetTicket.findFirst.mockResolvedValue(null);
    await expect(
      requestReschedule("u1", {
        ticketId: "other",
        suggestedAt: new Date(),
        reason: "Other",
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(mockPrisma.rescheduleRequest.create).not.toHaveBeenCalled();
  });
});
