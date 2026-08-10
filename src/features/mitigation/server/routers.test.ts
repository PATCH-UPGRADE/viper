// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { mockPrisma, mockGetSession } = vi.hoisted(() => {
  const prisma = {
    mitigationPlan: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      findUniqueOrThrow: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    workOrderTicket: {
      findMany: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    // The router uses prisma.$transaction(async (tx) => {...}) — invoke the
    // callback with the same mocked client so call assertions still work.
    $transaction: vi.fn(
      // biome-ignore lint/suspicious/noExplicitAny: callback shape varies
      async (cb: (tx: any) => Promise<unknown>) => cb(prisma),
    ),
  };
  return {
    mockPrisma: prisma,
    mockGetSession: vi.fn(),
  };
});

vi.mock("@/lib/db", () => ({ default: mockPrisma }));

vi.mock("@/lib/auth-utils", () => ({
  getSession: mockGetSession,
  verifyApiKey: vi.fn(),
}));

import { createCallerFactory } from "@/trpc/init";
import { mitigationRouter } from "./routers";

const createCaller = createCallerFactory(mitigationRouter);

const FAKE_USER_ID = "user-test";
const PLAN_ID = "plan-1";
const NOTIFICATION_ID = "notif-1";

const makeSession = () => ({
  user: {
    id: FAKE_USER_ID,
    name: "Test User",
    email: "test@example.com",
    emailVerified: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  session: {
    id: "session-1",
    userId: FAKE_USER_ID,
    token: "token",
    expiresAt: new Date(Date.now() + 60_000),
    createdAt: new Date(),
    updatedAt: new Date(),
  },
});

const setup = () => {
  mockGetSession.mockResolvedValue(makeSession());
  // biome-ignore lint/suspicious/noExplicitAny: test stub for tRPC ctx
  return createCaller({ req: {} as any });
};

const makeEdit = (id: string, overrides: Record<string, unknown> = {}) => ({
  id,
  summary: "Block TCP 32912 at the imaging VLAN boundary",
  body: "Update the boundary ACL on FW-IMG-201.",
  category: "NETWORK_REMEDIATION" as const,
  priority: "High" as const,
  departmentIds: ["dept-network"],
  assigneeId: "user-net",
  ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.mitigationPlan.findUnique.mockResolvedValue({
    id: PLAN_ID,
    notificationId: NOTIFICATION_ID,
  });
  mockPrisma.mitigationPlan.findUniqueOrThrow.mockResolvedValue({
    id: PLAN_ID,
    workOrders: [],
  });
});

describe("mitigationRouter.accept", () => {
  it("throws NOT_FOUND when the plan does not exist", async () => {
    mockPrisma.mitigationPlan.findUnique.mockResolvedValue(null);
    const caller = setup();

    await expect(caller.accept({ planId: PLAN_ID })).rejects.toThrow(
      "Plan not found",
    );
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  it("marks the plan accepted and promotes its drafts to real tickets", async () => {
    const caller = setup();

    await caller.accept({ planId: PLAN_ID });

    // Every other plan on the notification loses its accepted flag first.
    expect(mockPrisma.mitigationPlan.updateMany).toHaveBeenCalledWith({
      where: { notificationId: NOTIFICATION_ID },
      data: { isAccepted: false },
    });
    expect(mockPrisma.mitigationPlan.update).toHaveBeenCalledWith({
      where: { id: PLAN_ID },
      data: { isAccepted: true },
    });
    // Losing plans go back to drafts; this plan's become real tickets.
    expect(mockPrisma.workOrderTicket.updateMany).toHaveBeenCalledWith({
      where: {
        notificationId: NOTIFICATION_ID,
        mitigationPlanId: { not: PLAN_ID },
      },
      data: { isDraft: true },
    });
    expect(mockPrisma.workOrderTicket.updateMany).toHaveBeenCalledWith({
      where: { mitigationPlanId: PLAN_ID },
      data: { isDraft: false },
    });
  });

  it("applies the user's edits before promoting the drafts", async () => {
    mockPrisma.workOrderTicket.findMany.mockResolvedValue([
      { id: "wo-1" },
      { id: "wo-2" },
    ]);
    const caller = setup();

    await caller.accept({
      planId: PLAN_ID,
      edits: [makeEdit("wo-1"), makeEdit("wo-2", { assigneeId: null })],
    });

    expect(mockPrisma.workOrderTicket.update).toHaveBeenCalledWith({
      where: { id: "wo-1" },
      data: {
        summary: "Block TCP 32912 at the imaging VLAN boundary",
        body: "Update the boundary ACL on FW-IMG-201.",
        category: "NETWORK_REMEDIATION",
        priority: "High",
        departments: { set: [{ id: "dept-network" }] },
        assignee: { connect: { id: "user-net" } },
      },
    });
    // A cleared assignee disconnects rather than connecting to nothing.
    expect(mockPrisma.workOrderTicket.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "wo-2" },
        data: expect.objectContaining({ assignee: { disconnect: true } }),
      }),
    );
    expect(mockPrisma.workOrderTicket.updateMany).toHaveBeenCalledWith({
      where: { mitigationPlanId: PLAN_ID },
      data: { isDraft: false },
    });
  });

  it("rejects edits for work orders that belong to another plan", async () => {
    // Only one of the two ids is owned by this plan.
    mockPrisma.workOrderTicket.findMany.mockResolvedValue([{ id: "wo-1" }]);
    const caller = setup();

    await expect(
      caller.accept({
        planId: PLAN_ID,
        edits: [makeEdit("wo-1"), makeEdit("wo-other")],
      }),
    ).rejects.toThrow("Edited work order does not belong to this plan");

    expect(mockPrisma.workOrderTicket.update).not.toHaveBeenCalled();
    expect(mockPrisma.mitigationPlan.update).not.toHaveBeenCalled();
  });
});

describe("mitigationRouter.getForNotification", () => {
  it("returns the notification's plans in order", async () => {
    mockPrisma.mitigationPlan.findMany.mockResolvedValue([]);
    const caller = setup();

    await caller.getForNotification({ notificationId: NOTIFICATION_ID });

    expect(mockPrisma.mitigationPlan.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { notificationId: NOTIFICATION_ID },
        orderBy: { order: "asc" },
      }),
    );
  });
});
