// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { mockPrisma, mockGetSession } = vi.hoisted(() => ({
  mockPrisma: {
    workOrderTicket: {
      count: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
    },
    ticketComment: {
      create: vi.fn(),
    },
  },
  mockGetSession: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ default: mockPrisma }));

vi.mock("@/lib/auth-utils", () => ({
  getSession: mockGetSession,
  verifyApiKey: vi.fn(),
}));

import { createCallerFactory } from "@/trpc/init";
import { trackingRouter } from "./routers";

const createCaller = createCallerFactory(trackingRouter);

const FAKE_USER_ID = "user-test";

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

beforeEach(() => {
  vi.clearAllMocks();
});

describe("trackingRouter.update", () => {
  it("passes summary and description straight through", async () => {
    const caller = setup();
    mockPrisma.workOrderTicket.update.mockResolvedValue({ id: "t1" });

    await caller.update({
      id: "t1",
      summary: "New summary",
      description: "New body",
    });

    expect(mockPrisma.workOrderTicket.update).toHaveBeenCalledTimes(1);
    const arg = mockPrisma.workOrderTicket.update.mock.calls[0][0];
    expect(arg.where).toEqual({ id: "t1" });
    expect(arg.data).toEqual({
      summary: "New summary",
      description: "New body",
    });
  });

  it("replaces departments via m2m `set` with all selected ids", async () => {
    const caller = setup();
    mockPrisma.workOrderTicket.update.mockResolvedValue({ id: "t1" });

    await caller.update({
      id: "t1",
      departmentIds: ["d1", "d2", "d3"],
    });

    const arg = mockPrisma.workOrderTicket.update.mock.calls[0][0];
    expect(arg.data.departments).toEqual({
      set: [{ id: "d1" }, { id: "d2" }, { id: "d3" }],
    });
  });

  it("clears all departments when departmentIds is an empty array", async () => {
    const caller = setup();
    mockPrisma.workOrderTicket.update.mockResolvedValue({ id: "t1" });

    await caller.update({ id: "t1", departmentIds: [] });

    const arg = mockPrisma.workOrderTicket.update.mock.calls[0][0];
    expect(arg.data.departments).toEqual({ set: [] });
  });

  it("does not touch departments when departmentIds is omitted", async () => {
    const caller = setup();
    mockPrisma.workOrderTicket.update.mockResolvedValue({ id: "t1" });

    await caller.update({ id: "t1", summary: "only changing summary" });

    const arg = mockPrisma.workOrderTicket.update.mock.calls[0][0];
    expect(arg.data).not.toHaveProperty("departments");
  });

  it("clears assigneeId when null is passed", async () => {
    const caller = setup();
    mockPrisma.workOrderTicket.update.mockResolvedValue({ id: "t1" });

    await caller.update({ id: "t1", assigneeId: null });

    const arg = mockPrisma.workOrderTicket.update.mock.calls[0][0];
    expect(arg.data.assigneeId).toBeNull();
  });

  it("coerces scheduledAt ISO string into a Date", async () => {
    const caller = setup();
    mockPrisma.workOrderTicket.update.mockResolvedValue({ id: "t1" });

    await caller.update({
      id: "t1",
      // biome-ignore lint/suspicious/noExplicitAny: exercising z.coerce.date
      scheduledAt: "2026-06-01T15:30:00.000Z" as any,
    });

    const arg = mockPrisma.workOrderTicket.update.mock.calls[0][0];
    expect(arg.data.scheduledAt).toBeInstanceOf(Date);
    expect((arg.data.scheduledAt as Date).toISOString()).toBe(
      "2026-06-01T15:30:00.000Z",
    );
  });

  it("clears scheduledAt when null is passed", async () => {
    const caller = setup();
    mockPrisma.workOrderTicket.update.mockResolvedValue({ id: "t1" });

    await caller.update({ id: "t1", scheduledAt: null });

    const arg = mockPrisma.workOrderTicket.update.mock.calls[0][0];
    expect(arg.data.scheduledAt).toBeNull();
  });

  it("rejects an empty summary", async () => {
    const caller = setup();
    await expect(caller.update({ id: "t1", summary: "   " })).rejects.toThrow();
    expect(mockPrisma.workOrderTicket.update).not.toHaveBeenCalled();
  });

  it("throws UNAUTHORIZED when not authenticated", async () => {
    mockGetSession.mockResolvedValue(null);
    // biome-ignore lint/suspicious/noExplicitAny: stub req
    const caller = createCaller({ req: {} as any });

    await expect(
      caller.update({ id: "t1", summary: "anything" }),
    ).rejects.toThrow();
    expect(mockPrisma.workOrderTicket.update).not.toHaveBeenCalled();
  });
});

describe("trackingRouter.getMany — my-department tab", () => {
  const emptyResults = () => {
    mockPrisma.workOrderTicket.count.mockResolvedValue(0);
    mockPrisma.workOrderTicket.findMany.mockResolvedValue([]);
  };

  it("filters tickets by the user's department via m2m `some`", async () => {
    const caller = setup();
    mockPrisma.user.findUnique.mockResolvedValue({ departmentId: "dept-A" });
    emptyResults();

    await caller.getMany({
      tab: "my-department",
      page: 1,
      pageSize: 5,
      search: "",
      sort: "",
      lastUpdatedStartTime: "",
      lastUpdatedEndTime: "",
    });

    const where = mockPrisma.workOrderTicket.findMany.mock.calls[0][0].where;
    // AND[0] is parentId filter, AND[1] is the tab filter, AND[2] is search
    expect(where.AND[1]).toEqual({
      departments: { some: { id: "dept-A" } },
    });
  });

  it("returns a no-match filter when the user has no department", async () => {
    const caller = setup();
    mockPrisma.user.findUnique.mockResolvedValue({ departmentId: null });
    emptyResults();

    await caller.getMany({
      tab: "my-department",
      page: 1,
      pageSize: 5,
      search: "",
      sort: "",
      lastUpdatedStartTime: "",
      lastUpdatedEndTime: "",
    });

    const where = mockPrisma.workOrderTicket.findMany.mock.calls[0][0].where;
    expect(where.AND[1]).toEqual({ id: "__no_department__" });
  });
});

describe("trackingRouter.getOne", () => {
  it("returns the ticket when found", async () => {
    const caller = setup();
    const ticket = { id: "t1", summary: "Found" };
    mockPrisma.workOrderTicket.findUnique.mockResolvedValue(ticket);

    const result = await caller.getOne({ id: "t1" });
    expect(result).toBe(ticket);
  });

  it("throws NOT_FOUND when the ticket does not exist", async () => {
    const caller = setup();
    mockPrisma.workOrderTicket.findUnique.mockResolvedValue(null);

    await expect(caller.getOne({ id: "missing" })).rejects.toThrow(
      /not found/i,
    );
  });
});

describe("trackingRouter.addComment", () => {
  it("creates a comment with the authenticated user as author", async () => {
    const caller = setup();
    mockPrisma.ticketComment.create.mockResolvedValue({ id: "c1" });

    await caller.addComment({ ticketId: "t1", body: "Hello world" });

    expect(mockPrisma.ticketComment.create).toHaveBeenCalledWith({
      data: {
        ticketId: "t1",
        authorId: FAKE_USER_ID,
        body: "Hello world",
      },
    });
  });

  it("trims whitespace and rejects empty bodies", async () => {
    const caller = setup();

    await expect(
      caller.addComment({ ticketId: "t1", body: "   " }),
    ).rejects.toThrow();
    expect(mockPrisma.ticketComment.create).not.toHaveBeenCalled();
  });
});

describe("trackingRouter.list", () => {
  const emptyResults = () => {
    mockPrisma.workOrderTicket.count.mockResolvedValue(0);
    mockPrisma.workOrderTicket.findMany.mockResolvedValue([]);
  };

  const baseInput = {
    page: 1,
    pageSize: 25,
    search: "",
    sort: "",
    lastUpdatedStartTime: "",
    lastUpdatedEndTime: "",
  };

  it("issues a query with no filters when none are provided", async () => {
    const caller = setup();
    emptyResults();

    await caller.list(baseInput);

    expect(mockPrisma.workOrderTicket.count).toHaveBeenCalledTimes(1);
    expect(mockPrisma.workOrderTicket.findMany).toHaveBeenCalledTimes(1);
    const findManyArg =
      mockPrisma.workOrderTicket.findMany.mock.calls[0][0];
    // Only the (empty) search filter ends up in the AND list
    expect(findManyArg.where.AND).toEqual([{}]);
  });

  it("filters by departmentIds via m2m `some` + `in`", async () => {
    const caller = setup();
    emptyResults();

    await caller.list({ ...baseInput, departmentIds: ["d1", "d2"] });

    const findManyArg =
      mockPrisma.workOrderTicket.findMany.mock.calls[0][0];
    expect(findManyArg.where.AND).toContainEqual({
      departments: { some: { id: { in: ["d1", "d2"] } } },
    });
  });

  it("ignores an empty departmentIds array", async () => {
    const caller = setup();
    emptyResults();

    await caller.list({ ...baseInput, departmentIds: [] });

    const findManyArg =
      mockPrisma.workOrderTicket.findMany.mock.calls[0][0];
    expect(JSON.stringify(findManyArg.where)).not.toContain("departments");
  });

  it("filters by assigneeIds using `assigneeId in [...]`", async () => {
    const caller = setup();
    emptyResults();

    await caller.list({ ...baseInput, assigneeIds: ["u1", "u2"] });

    const findManyArg =
      mockPrisma.workOrderTicket.findMany.mock.calls[0][0];
    expect(findManyArg.where.AND).toContainEqual({
      assigneeId: { in: ["u1", "u2"] },
    });
  });

  it("filters by lifeSafety true", async () => {
    const caller = setup();
    emptyResults();

    await caller.list({ ...baseInput, lifeSafety: true });

    const findManyArg =
      mockPrisma.workOrderTicket.findMany.mock.calls[0][0];
    expect(findManyArg.where.AND).toContainEqual({ lifeSafety: true });
  });

  it("filters by lifeSafety false (distinct from omitting it)", async () => {
    const caller = setup();
    emptyResults();

    await caller.list({ ...baseInput, lifeSafety: false });

    const findManyArg =
      mockPrisma.workOrderTicket.findMany.mock.calls[0][0];
    expect(findManyArg.where.AND).toContainEqual({ lifeSafety: false });
  });

  it("combines all filters with AND", async () => {
    const caller = setup();
    emptyResults();

    await caller.list({
      ...baseInput,
      departmentIds: ["d1"],
      assigneeIds: ["u1"],
      lifeSafety: true,
    });

    const findManyArg =
      mockPrisma.workOrderTicket.findMany.mock.calls[0][0];
    const and = findManyArg.where.AND as Array<Record<string, unknown>>;
    expect(and).toEqual(
      expect.arrayContaining([
        { departments: { some: { id: { in: ["d1"] } } } },
        { assigneeId: { in: ["u1"] } },
        { lifeSafety: true },
      ]),
    );
  });

  it("forwards the linked-entity include shape to findMany", async () => {
    const caller = setup();
    emptyResults();

    await caller.list(baseInput);

    const findManyArg =
      mockPrisma.workOrderTicket.findMany.mock.calls[0][0];
    expect(findManyArg.include).toMatchObject({
      departments: expect.any(Object),
      assignee: expect.any(Object),
      assets: expect.any(Object),
      vulnerabilities: expect.any(Object),
      advisories: expect.any(Object),
      remediations: expect.any(Object),
    });
  });

  it("paginates results with the requested page and pageSize", async () => {
    const caller = setup();
    mockPrisma.workOrderTicket.count.mockResolvedValue(42);
    mockPrisma.workOrderTicket.findMany.mockResolvedValue([]);

    const result = await caller.list({ ...baseInput, page: 3, pageSize: 10 });

    const findManyArg =
      mockPrisma.workOrderTicket.findMany.mock.calls[0][0];
    expect(findManyArg.skip).toBe(20);
    expect(findManyArg.take).toBe(10);
    expect(result.totalCount).toBe(42);
    expect(result.page).toBe(3);
    expect(result.pageSize).toBe(10);
    expect(result.totalPages).toBe(5);
  });

  it("applies a fuzzy search filter on summary/description", async () => {
    const caller = setup();
    emptyResults();

    await caller.list({ ...baseInput, search: "ICU" });

    const findManyArg =
      mockPrisma.workOrderTicket.findMany.mock.calls[0][0];
    expect(findManyArg.where.AND).toContainEqual({
      OR: [
        { summary: { contains: "ICU", mode: "insensitive" } },
        { description: { contains: "ICU", mode: "insensitive" } },
      ],
    });
  });

  it("throws UNAUTHORIZED when not authenticated", async () => {
    mockGetSession.mockResolvedValue(null);
    // biome-ignore lint/suspicious/noExplicitAny: stub req
    const caller = createCaller({ req: {} as any });

    await expect(caller.list(baseInput)).rejects.toThrow();
    expect(mockPrisma.workOrderTicket.findMany).not.toHaveBeenCalled();
  });
});
