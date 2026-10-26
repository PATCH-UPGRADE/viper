// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { mockPrisma, mockGetSession } = vi.hoisted(() => ({
  mockPrisma: {
    notification: { count: vi.fn(), findMany: vi.fn() },
  },
  mockGetSession: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ default: mockPrisma }));

vi.mock("@/lib/auth-utils", () => ({
  getSession: mockGetSession,
  verifyApiKey: vi.fn(),
}));

import { createCallerFactory } from "@/trpc/init";
import { notificationsRouter } from "../routers";

const createCaller = createCallerFactory(notificationsRouter);

const setup = () => {
  mockGetSession.mockResolvedValue({
    user: {
      id: "user-test",
      name: "Test User",
      email: "test@example.com",
      emailVerified: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    session: {
      id: "session-1",
      userId: "user-test",
      token: "token",
      expiresAt: new Date(Date.now() + 60_000),
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  });
  // biome-ignore lint/suspicious/noExplicitAny: test stub for tRPC ctx
  return createCaller({ req: {} as any });
};

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.notification.count.mockResolvedValue(0);
  mockPrisma.notification.findMany.mockResolvedValue([]);
});

describe("notifications.getMany filters", () => {
  it("filters on updatedAt in the count and the page query", async () => {
    await setup().getMany({
      lastUpdatedStartTime: "2026-10-20T00:00:00Z",
      lastUpdatedEndTime: "2026-10-21T00:00:00Z",
    });

    const updatedAt = {
      gte: new Date("2026-10-20T00:00:00Z"),
      lte: new Date("2026-10-21T00:00:00Z"),
    };
    const [countArgs] = mockPrisma.notification.count.mock.calls[0];
    const [findArgs] = mockPrisma.notification.findMany.mock.calls[0];
    expect(countArgs.where.AND).toContainEqual({ updatedAt });
    expect(findArgs.where.AND).toContainEqual({ updatedAt });
  });

  it("adds no date filter when the fields are empty", async () => {
    await setup().getMany({});

    const [countArgs] = mockPrisma.notification.count.mock.calls[0];
    expect(
      countArgs.where.AND.some((clause: object) => "updatedAt" in clause),
    ).toBe(false);
  });

  it("sorts by priority, then by the newest update", async () => {
    await setup().getMany({ sort: "priority" });

    const [findArgs] = mockPrisma.notification.findMany.mock.calls[0];
    expect(findArgs.orderBy).toEqual([
      { priority: "asc" },
      { updatedAt: "desc" },
    ]);
  });
});
