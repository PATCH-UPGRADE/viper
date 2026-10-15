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

const request = {
  id: "r1",
  ticketId: "t1",
  requestedById: "someone",
  requestedBy: { id: "someone", name: "Sam" },
  fromScheduledAt: from,
  proposedAt,
};
const ask = (input = {}) =>
  caller.requestReschedule({ ticketId: "t1", proposedAt, ...input });
const decide = (decision: "approve" | "decline" | "cancel", reason?: string) =>
  caller.decideReschedule({ requestId: "r1", decision, reason });
const activity = () => mockPrisma.ticketActivity.create.mock.calls[0][0].data;

beforeEach(() => {
  vi.resetAllMocks();
  mockPrisma.$transaction.mockImplementation(async (cb) => cb(mockPrisma));
  mockPrisma.user.findUnique.mockResolvedValue({ departmentId: "d1" });
  // The user may open the ticket.
  mockPrisma.workOrderTicket.count.mockResolvedValue(1);
  mockPrisma.workOrderTicket.findUniqueOrThrow.mockResolvedValue({
    scheduledAt: from,
    scheduledEndTime: end,
  });
  mockPrisma.rescheduleRequest.count.mockResolvedValue(0);
  mockPrisma.rescheduleRequest.create.mockResolvedValue({ id: "r1" });
  mockPrisma.rescheduleRequest.findUnique.mockResolvedValue(request);
  mockPrisma.rescheduleRequest.updateMany.mockResolvedValue({ count: 1 });
});

describe("requestReschedule", () => {
  it("creates the request and its activity", async () => {
    await ask();

    expect(mockPrisma.rescheduleRequest.create.mock.calls[0][0].data).toEqual({
      ticketId: "t1",
      requestedById: "me",
      fromScheduledAt: from,
      proposedAt,
      reason: null,
    });
    expect(activity()).toMatchObject({ type: "RESCHEDULE_REQUESTED" });
  });

  it.each([
    ["a time in the past", { proposedAt: new Date("2000-01-01") }, 0],
    ["the time it already has", { proposedAt: from }, 0],
    ["a second pending request", {}, 1],
  ])("rejects %s", async (_name, input, pending) => {
    mockPrisma.rescheduleRequest.count.mockResolvedValue(pending);
    await expect(ask(input)).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});

describe("decideReschedule", () => {
  it("approving moves the ticket, its duration and its devices", async () => {
    await decide("approve");

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
    expect(activity()).toMatchObject({ type: "RESCHEDULE_APPROVED" });
  });

  it.each([
    ["decline", "RESCHEDULE_DECLINED", "someone"],
    ["cancel", "RESCHEDULE_CANCELLED", "me"],
  ] as const)(
    "%s leaves the time alone and keeps the reason",
    async (decision, type, requestedById) => {
      mockPrisma.rescheduleRequest.findUnique.mockResolvedValue({
        ...request,
        requestedById,
      });
      await decide(decision, "Because");

      expect(mockPrisma.workOrderTicket.update).not.toHaveBeenCalled();
      expect(activity()).toMatchObject({ type, data: { reason: "Because" } });
    },
  );

  it.each([
    ["approve", "me"],
    ["cancel", "someone"],
  ] as const)(
    "does not let the wrong user %s",
    async (decision, requestedById) => {
      mockPrisma.rescheduleRequest.findUnique.mockResolvedValue({
        ...request,
        requestedById,
      });
      await expect(decide(decision)).rejects.toMatchObject({
        code: "FORBIDDEN",
      });
    },
  );

  it("does not decide a request on a ticket the user cannot open", async () => {
    mockPrisma.workOrderTicket.count.mockResolvedValue(0);
    await expect(decide("approve")).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });

  it("fails when someone else decided first", async () => {
    mockPrisma.rescheduleRequest.updateMany.mockResolvedValue({ count: 0 });
    await expect(decide("approve")).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
    expect(mockPrisma.workOrderTicket.update).not.toHaveBeenCalled();
  });
});
