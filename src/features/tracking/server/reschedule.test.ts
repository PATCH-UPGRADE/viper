// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { mockPrisma } = vi.hoisted(() => {
  const prisma = {
    user: { findUnique: vi.fn() },
    workOrderTicket: {
      count: vi.fn(),
      findUniqueOrThrow: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    rescheduleRequest: {
      count: vi.fn(),
      create: vi.fn(),
      findUnique: vi.fn(),
      updateMany: vi.fn(),
    },
    ticketActivity: { create: vi.fn() },
    // biome-ignore lint/suspicious/noExplicitAny: callback shape varies
    $transaction: vi.fn(async (cb: (tx: any) => Promise<unknown>) =>
      cb(prisma),
    ),
  };
  return { mockPrisma: prisma };
});

vi.mock("@/lib/db", () => ({ default: mockPrisma }));
vi.mock("@/features/work-orders/server/payload", () => ({}));
vi.mock("@/features/work-orders/server/submit", () => ({}));
vi.mock("@/inngest/client", () => ({ inngest: { send: vi.fn() } }));

import { createCallerFactory } from "@/trpc/init";
import { trackingRouter } from "./routers";

const caller = createCallerFactory(trackingRouter)({
  auth: { user: { id: "me", name: "Me" } },
} as never);

const from = new Date("2099-01-01T09:00:00Z");
const end = new Date("2099-01-01T10:30:00Z");
const proposedAt = new Date("2099-01-02T13:00:00Z");

beforeEach(() => {
  vi.resetAllMocks();
  mockPrisma.$transaction.mockImplementation(async (cb) => cb(mockPrisma));
  mockPrisma.user.findUnique.mockResolvedValue({ departmentId: "d1" });
  // The user may open the ticket.
  mockPrisma.workOrderTicket.count.mockResolvedValue(1);
});

describe("requestReschedule", () => {
  beforeEach(() => {
    mockPrisma.workOrderTicket.findUniqueOrThrow.mockResolvedValue({
      scheduledAt: from,
    });
    mockPrisma.rescheduleRequest.count.mockResolvedValue(0);
    mockPrisma.rescheduleRequest.create.mockResolvedValue({
      id: "r1",
      reason: "Surgery",
    });
  });

  it("creates the request and its activity", async () => {
    await caller.requestReschedule({
      ticketId: "t1",
      proposedAt,
      reason: "Surgery",
    });

    expect(mockPrisma.rescheduleRequest.create).toHaveBeenCalledWith({
      data: {
        ticketId: "t1",
        requestedById: "me",
        fromScheduledAt: from,
        proposedAt,
        reason: "Surgery",
      },
    });
    expect(mockPrisma.ticketActivity.create).toHaveBeenCalledWith({
      data: {
        ticketId: "t1",
        userId: "me",
        type: "RESCHEDULE_REQUESTED",
        data: { requestId: "r1", from, to: proposedAt, reason: "Surgery" },
      },
    });
  });

  it.each([
    ["a time in the past", { proposedAt: new Date("2000-01-01") }],
    ["the time it already has", { proposedAt: from }],
  ])("rejects %s", async (_name, input) => {
    await expect(
      caller.requestReschedule({ ticketId: "t1", ...input }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(mockPrisma.rescheduleRequest.create).not.toHaveBeenCalled();
  });

  it("rejects a second pending request", async () => {
    mockPrisma.rescheduleRequest.count.mockResolvedValue(1);
    await expect(
      caller.requestReschedule({ ticketId: "t1", proposedAt }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(mockPrisma.rescheduleRequest.create).not.toHaveBeenCalled();
  });

  it("does not open a Done ticket, or one outside the department", async () => {
    mockPrisma.workOrderTicket.count.mockResolvedValue(0);
    await expect(
      caller.requestReschedule({ ticketId: "t1", proposedAt }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("decideReschedule", () => {
  const request = {
    id: "r1",
    ticketId: "t1",
    requestedById: "someone",
    requestedBy: { id: "someone", name: "Sam" },
    fromScheduledAt: from,
    proposedAt,
  };

  beforeEach(() => {
    mockPrisma.rescheduleRequest.findUnique.mockResolvedValue(request);
    mockPrisma.rescheduleRequest.updateMany.mockResolvedValue({ count: 1 });
    mockPrisma.workOrderTicket.findUniqueOrThrow.mockResolvedValue({
      scheduledAt: from,
      scheduledEndTime: end,
    });
  });

  it("approving moves the ticket, its duration and its devices", async () => {
    await caller.decideReschedule({ requestId: "r1", decision: "approve" });

    expect(mockPrisma.workOrderTicket.update).toHaveBeenCalledWith({
      where: { id: "t1" },
      data: {
        scheduledAt: proposedAt,
        scheduledEndTime: new Date("2099-01-02T14:30:00Z"),
      },
    });
    expect(mockPrisma.workOrderTicket.updateMany).toHaveBeenCalledWith({
      where: { parentId: "t1", ticket: { isNot: null }, scheduledAt: from },
      data: { scheduledAt: proposedAt },
    });
    expect(mockPrisma.ticketActivity.create.mock.calls[0][0].data).toEqual({
      ticketId: "t1",
      userId: "me",
      type: "RESCHEDULE_APPROVED",
      data: {
        requestId: "r1",
        from,
        to: proposedAt,
        requestedBy: { id: "someone", name: "Sam" },
      },
    });
  });

  it("declining leaves the time alone", async () => {
    await caller.decideReschedule({ requestId: "r1", decision: "decline" });

    expect(mockPrisma.workOrderTicket.update).not.toHaveBeenCalled();
    expect(mockPrisma.workOrderTicket.updateMany).not.toHaveBeenCalled();
    expect(mockPrisma.ticketActivity.create.mock.calls[0][0].data.type).toBe(
      "RESCHEDULE_DECLINED",
    );
  });

  it("does not let the requester decide", async () => {
    mockPrisma.rescheduleRequest.findUnique.mockResolvedValue({
      ...request,
      requestedById: "me",
    });
    await expect(
      caller.decideReschedule({ requestId: "r1", decision: "approve" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("does not decide a request on a ticket the user cannot open", async () => {
    mockPrisma.workOrderTicket.count.mockResolvedValue(0);
    await expect(
      caller.decideReschedule({ requestId: "r1", decision: "approve" }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(mockPrisma.rescheduleRequest.updateMany).not.toHaveBeenCalled();
  });

  it("fails when someone else decided first", async () => {
    mockPrisma.rescheduleRequest.updateMany.mockResolvedValue({ count: 0 });
    await expect(
      caller.decideReschedule({ requestId: "r1", decision: "approve" }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(mockPrisma.workOrderTicket.update).not.toHaveBeenCalled();
  });
});
