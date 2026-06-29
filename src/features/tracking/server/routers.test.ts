// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { mockPrisma, mockGetSession } = vi.hoisted(() => {
  const prisma = {
    workOrderTicket: {
      count: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      findUniqueOrThrow: vi.fn(),
      update: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
    },
    ticketComment: {
      create: vi.fn(),
    },
    ticketWatch: {
      upsert: vi.fn(),
      deleteMany: vi.fn(),
    },
    ticketSeen: {
      upsert: vi.fn(),
    },
    ticketActivity: {
      create: vi.fn(),
      createMany: vi.fn(),
    },
    ticketDescription: {
      upsert: vi.fn(),
      deleteMany: vi.fn(),
    },
    asset: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
    },
    department: {
      findMany: vi.fn(),
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
import { trackingRouter } from "./routers";

const createCaller = createCallerFactory(trackingRouter);

const FAKE_USER_ID = "user-test";

// biome-ignore lint/suspicious/noExplicitAny: test fixture
const makeTicketDetail = (overrides: Record<string, any> = {}): any => ({
  id: "t1",
  summary: "Test ticket",
  status: "TO_DO",
  category: "PATCH",
  source: "MANUAL",
  scheduledAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  lastCommentAt: null,
  parentId: null,
  creatorId: FAKE_USER_ID,
  assigneeId: null,
  sourceLabel: null,
  departments: [],
  descriptions: [],
  assignee: null,
  creator: { id: FAKE_USER_ID, name: "Test User", email: "test@example.com" },
  parent: null,
  children: [],
  assets: [],
  vulnerabilities: [],
  advisories: [],
  remediations: [],
  issues: [],
  comments: [],
  watchers: [],
  activities: [],
  ...overrides,
});

// biome-ignore lint/suspicious/noExplicitAny: test fixture
const makeTicketComment = (overrides: Record<string, any> = {}): any => ({
  id: "c1",
  ticketId: "t1",
  authorId: FAKE_USER_ID,
  body: "Test comment",
  createdAt: new Date(),
  updatedAt: new Date(),
  author: {
    id: FAKE_USER_ID,
    name: "Test User",
    email: "test@example.com",
    image: null,
    department: null,
  },
  ...overrides,
});

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

// Minimal "before" shape for snapshotBeforeUpdate. Tests that exercise
// specific diffs override this in-place.
// biome-ignore lint/suspicious/noExplicitAny: test fixture
const makeUpdateBefore = (overrides: Record<string, any> = {}): any => ({
  summary: "Test ticket",
  status: "TO_DO",
  category: "PATCH",
  scheduledAt: null,
  assigneeId: null,
  assignee: null,
  departments: [],
  descriptions: [],
  ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
  // Sensible defaults for the update-flow mocks so tests that don't care
  // about the diff don't have to set them up individually.
  mockPrisma.workOrderTicket.findUnique.mockResolvedValue(makeUpdateBefore());
  mockPrisma.workOrderTicket.findUniqueOrThrow.mockResolvedValue(
    makeTicketDetail(),
  );
  mockPrisma.department.findMany.mockResolvedValue([]);
  mockPrisma.asset.findUnique.mockResolvedValue(null);
});

describe("trackingRouter.update", () => {
  it("passes summary straight through", async () => {
    const caller = setup();
    mockPrisma.workOrderTicket.update.mockResolvedValue(makeTicketDetail());

    await caller.update({
      id: "t1",
      summary: "New summary",
    });

    expect(mockPrisma.workOrderTicket.update).toHaveBeenCalledTimes(1);
    const arg = mockPrisma.workOrderTicket.update.mock.calls[0][0];
    expect(arg.where).toEqual({ id: "t1" });
    expect(arg.data).toEqual({
      summary: "New summary",
    });
  });

  it("replaces departments via m2m `set` with all selected ids", async () => {
    const caller = setup();
    mockPrisma.workOrderTicket.update.mockResolvedValue(makeTicketDetail());

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
    mockPrisma.workOrderTicket.update.mockResolvedValue(makeTicketDetail());

    await caller.update({ id: "t1", departmentIds: [] });

    const arg = mockPrisma.workOrderTicket.update.mock.calls[0][0];
    expect(arg.data.departments).toEqual({ set: [] });
  });

  it("does not touch departments when departmentIds is omitted", async () => {
    const caller = setup();
    mockPrisma.workOrderTicket.update.mockResolvedValue(makeTicketDetail());

    await caller.update({ id: "t1", summary: "only changing summary" });

    const arg = mockPrisma.workOrderTicket.update.mock.calls[0][0];
    expect(arg.data).not.toHaveProperty("departments");
  });

  it("clears assigneeId when null is passed", async () => {
    const caller = setup();
    mockPrisma.workOrderTicket.update.mockResolvedValue(makeTicketDetail());

    await caller.update({ id: "t1", assigneeId: null });

    const arg = mockPrisma.workOrderTicket.update.mock.calls[0][0];
    expect(arg.data.assigneeId).toBeNull();
  });

  it("coerces scheduledAt ISO string into a Date", async () => {
    const caller = setup();
    mockPrisma.workOrderTicket.update.mockResolvedValue(makeTicketDetail());

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
    mockPrisma.workOrderTicket.update.mockResolvedValue(makeTicketDetail());

    await caller.update({ id: "t1", scheduledAt: null });

    const arg = mockPrisma.workOrderTicket.update.mock.calls[0][0];
    expect(arg.data.scheduledAt).toBeNull();
  });

  it("rejects an empty summary", async () => {
    const caller = setup();
    await expect(caller.update({ id: "t1", summary: "   " })).rejects.toThrow();
    expect(mockPrisma.workOrderTicket.update).not.toHaveBeenCalled();
  });

  it("upserts a description for a department that's on the ticket", async () => {
    const caller = setup();
    mockPrisma.workOrderTicket.findUnique.mockResolvedValue(
      makeUpdateBefore({
        departments: [{ id: "d1", name: "Biomed", color: null }],
      }),
    );
    mockPrisma.workOrderTicket.update.mockResolvedValue(makeTicketDetail());

    await caller.update({
      id: "t1",
      descriptions: [{ departmentId: "d1", body: "New Biomed write-up" }],
    });

    expect(mockPrisma.ticketDescription.upsert).toHaveBeenCalledTimes(1);
    const arg = mockPrisma.ticketDescription.upsert.mock.calls[0][0];
    expect(arg.where).toEqual({
      ticketId_departmentId: { ticketId: "t1", departmentId: "d1" },
    });
    expect(arg.create).toEqual({
      ticketId: "t1",
      departmentId: "d1",
      body: "New Biomed write-up",
    });
    expect(arg.update).toEqual({ body: "New Biomed write-up" });
  });

  it("ignores descriptions targeting departments not on the ticket", async () => {
    const caller = setup();
    mockPrisma.workOrderTicket.findUnique.mockResolvedValue(makeUpdateBefore());
    mockPrisma.workOrderTicket.update.mockResolvedValue(makeTicketDetail());

    await caller.update({
      id: "t1",
      descriptions: [{ departmentId: "d-not-on-ticket", body: "anything" }],
    });

    expect(mockPrisma.ticketDescription.upsert).not.toHaveBeenCalled();
  });

  it("drops a description when its body is empty/whitespace", async () => {
    const caller = setup();
    mockPrisma.workOrderTicket.findUnique.mockResolvedValue(
      makeUpdateBefore({
        departments: [{ id: "d1", name: "Biomed", color: null }],
        descriptions: [{ departmentId: "d1", body: "Old body" }],
      }),
    );
    mockPrisma.workOrderTicket.update.mockResolvedValue(makeTicketDetail());

    await caller.update({
      id: "t1",
      descriptions: [{ departmentId: "d1", body: "   " }],
    });

    expect(mockPrisma.ticketDescription.deleteMany).toHaveBeenCalledTimes(1);
    expect(mockPrisma.ticketDescription.deleteMany.mock.calls[0][0]).toEqual({
      where: { ticketId: "t1", departmentId: { in: ["d1"] } },
    });
    expect(mockPrisma.ticketDescription.upsert).not.toHaveBeenCalled();
  });

  it("removes descriptions for departments dropped from the ticket", async () => {
    const caller = setup();
    mockPrisma.workOrderTicket.findUnique.mockResolvedValue(
      makeUpdateBefore({
        departments: [
          { id: "d-keep", name: "Keep", color: null },
          { id: "d-drop", name: "Drop", color: null },
        ],
        descriptions: [
          { departmentId: "d-keep", body: "Keep me" },
          { departmentId: "d-drop", body: "Bye" },
        ],
      }),
    );
    mockPrisma.workOrderTicket.update.mockResolvedValue(makeTicketDetail());

    await caller.update({ id: "t1", departmentIds: ["d-keep"] });

    expect(mockPrisma.ticketDescription.deleteMany).toHaveBeenCalledTimes(1);
    expect(mockPrisma.ticketDescription.deleteMany.mock.calls[0][0]).toEqual({
      where: { ticketId: "t1", departmentId: { in: ["d-drop"] } },
    });
  });

  it("writes a DESCRIPTION_CHANGED activity scoped to the department that changed", async () => {
    const caller = setup();
    mockPrisma.workOrderTicket.findUnique.mockResolvedValue(
      makeUpdateBefore({
        departments: [{ id: "d1", name: "Biomed", color: null }],
        descriptions: [{ departmentId: "d1", body: "Old body" }],
      }),
    );
    mockPrisma.department.findMany.mockResolvedValueOnce([
      { id: "d1", name: "Biomed", color: "green" },
    ]);
    mockPrisma.workOrderTicket.update.mockResolvedValue(makeTicketDetail());

    await caller.update({
      id: "t1",
      descriptions: [{ departmentId: "d1", body: "New body" }],
    });

    const [arg] = mockPrisma.ticketActivity.createMany.mock.calls[0];
    expect(arg.data[0]).toMatchObject({
      type: "DESCRIPTION_CHANGED",
      data: {
        department: { id: "d1", name: "Biomed", color: "green" },
        from: "Old body",
        to: "New body",
      },
    });
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
    const ticket = makeTicketDetail({ summary: "Found" });
    mockPrisma.workOrderTicket.findUnique.mockResolvedValue(ticket);

    const result = await caller.getOne({ id: "t1" });
    expect(result).toMatchObject({ id: "t1", summary: "Found" });
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
    mockPrisma.ticketComment.create.mockResolvedValue(makeTicketComment());
    mockPrisma.workOrderTicket.update.mockResolvedValue({});

    await caller.addComment({ ticketId: "t1", body: "Hello world" });

    expect(mockPrisma.ticketComment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          ticketId: "t1",
          authorId: FAKE_USER_ID,
          body: "Hello world",
        },
      }),
    );
  });

  it("stamps the ticket's lastCommentAt in the same transaction", async () => {
    const caller = setup();
    mockPrisma.ticketComment.create.mockResolvedValue(makeTicketComment());
    mockPrisma.workOrderTicket.update.mockResolvedValue({});

    await caller.addComment({ ticketId: "t1", body: "Hello" });

    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
    expect(mockPrisma.workOrderTicket.update).toHaveBeenCalledTimes(1);
    const arg = mockPrisma.workOrderTicket.update.mock.calls[0][0];
    expect(arg.where).toEqual({ id: "t1" });
    expect(arg.data.lastCommentAt).toBeInstanceOf(Date);
  });

  it("trims whitespace and rejects empty bodies", async () => {
    const caller = setup();

    await expect(
      caller.addComment({ ticketId: "t1", body: "   " }),
    ).rejects.toThrow();
    expect(mockPrisma.ticketComment.create).not.toHaveBeenCalled();
    expect(mockPrisma.workOrderTicket.update).not.toHaveBeenCalled();
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
    const findManyArg = mockPrisma.workOrderTicket.findMany.mock.calls[0][0];
    // Only the (empty) search filter ends up in the AND list
    expect(findManyArg.where.AND).toEqual([{}]);
  });

  it("filters by departmentIds via m2m `some` + `in`", async () => {
    const caller = setup();
    emptyResults();

    await caller.list({ ...baseInput, departmentIds: ["d1", "d2"] });

    const findManyArg = mockPrisma.workOrderTicket.findMany.mock.calls[0][0];
    expect(findManyArg.where.AND).toContainEqual({
      departments: { some: { id: { in: ["d1", "d2"] } } },
    });
  });

  it("ignores an empty departmentIds array", async () => {
    const caller = setup();
    emptyResults();

    await caller.list({ ...baseInput, departmentIds: [] });

    const findManyArg = mockPrisma.workOrderTicket.findMany.mock.calls[0][0];
    expect(JSON.stringify(findManyArg.where)).not.toContain("departments");
  });

  it("filters by assigneeIds using `assigneeId in [...]`", async () => {
    const caller = setup();
    emptyResults();

    await caller.list({ ...baseInput, assigneeIds: ["u1", "u2"] });

    const findManyArg = mockPrisma.workOrderTicket.findMany.mock.calls[0][0];
    expect(findManyArg.where.AND).toContainEqual({
      assigneeId: { in: ["u1", "u2"] },
    });
  });

  it("combines all filters with AND", async () => {
    const caller = setup();
    emptyResults();

    await caller.list({
      ...baseInput,
      departmentIds: ["d1"],
      assigneeIds: ["u1"],
    });

    const findManyArg = mockPrisma.workOrderTicket.findMany.mock.calls[0][0];
    const and = findManyArg.where.AND as Array<Record<string, unknown>>;
    expect(and).toEqual(
      expect.arrayContaining([
        { departments: { some: { id: { in: ["d1"] } } } },
        { assigneeId: { in: ["u1"] } },
      ]),
    );
  });

  it("forwards the linked-entity include shape to findMany", async () => {
    const caller = setup();
    emptyResults();

    await caller.list(baseInput);

    const findManyArg = mockPrisma.workOrderTicket.findMany.mock.calls[0][0];
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

    const findManyArg = mockPrisma.workOrderTicket.findMany.mock.calls[0][0];
    expect(findManyArg.skip).toBe(20);
    expect(findManyArg.take).toBe(10);
    expect(result.totalCount).toBe(42);
    expect(result.page).toBe(3);
    expect(result.pageSize).toBe(10);
    expect(result.totalPages).toBe(5);
  });

  it("applies a fuzzy search filter on summary and per-department descriptions", async () => {
    const caller = setup();
    emptyResults();

    await caller.list({ ...baseInput, search: "ICU" });

    const findManyArg = mockPrisma.workOrderTicket.findMany.mock.calls[0][0];
    expect(findManyArg.where.AND).toContainEqual({
      OR: [
        { summary: { contains: "ICU", mode: "insensitive" } },
        {
          descriptions: {
            some: { body: { contains: "ICU", mode: "insensitive" } },
          },
        },
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

  it("passes the watchers include filtered by the current user", async () => {
    const caller = setup();
    emptyResults();

    await caller.list(baseInput);

    const findManyArg = mockPrisma.workOrderTicket.findMany.mock.calls[0][0];
    expect(findManyArg.include.watchers).toEqual({
      where: { userId: FAKE_USER_ID },
      select: { userId: true },
    });
  });

  it("flattens watchers into an isWatching field per item", async () => {
    const caller = setup();
    const baseItem = {
      summary: "x",
      status: "TO_DO",
      category: "PATCH",
      source: "MANUAL",
      scheduledAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      parentId: null,
      creatorId: "c1",
      assigneeId: null,
      sourceLabel: null,
      departments: [],
      assignee: null,
      assets: [],
      vulnerabilities: [],
      advisories: [],
      remediations: [],
    };
    mockPrisma.workOrderTicket.count.mockResolvedValue(2);
    mockPrisma.workOrderTicket.findMany.mockResolvedValue([
      { id: "t-watched", ...baseItem, watchers: [{ userId: FAKE_USER_ID }] },
      { id: "t-unwatched", ...baseItem, watchers: [] },
    ]);

    const result = await caller.list(baseInput);

    expect(result.items).toEqual([
      expect.objectContaining({ id: "t-watched", isWatching: true }),
      expect.objectContaining({ id: "t-unwatched", isWatching: false }),
    ]);
    // Raw `watchers` should not leak into the response.
    expect(result.items[0]).not.toHaveProperty("watchers");
  });
});

describe("trackingRouter.getOne", () => {
  it("scopes watchers to the current user when fetching a ticket", async () => {
    const caller = setup();
    mockPrisma.workOrderTicket.findUnique.mockResolvedValue(makeTicketDetail());

    await caller.getOne({ id: "t1" });

    const arg = mockPrisma.workOrderTicket.findUnique.mock.calls[0][0];
    expect(arg.include.watchers).toEqual({
      where: { userId: FAKE_USER_ID },
      select: { userId: true },
    });
  });

  it("collapses watchers into an isWatching boolean", async () => {
    const caller = setup();
    mockPrisma.workOrderTicket.findUnique.mockResolvedValue(
      makeTicketDetail({ watchers: [{ userId: FAKE_USER_ID }] }),
    );

    const result = await caller.getOne({ id: "t1" });

    expect(result.isWatching).toBe(true);
    expect(result).not.toHaveProperty("watchers");
  });
});

describe("trackingRouter.getMany", () => {
  it("scopes watchers to the current user on both parents and children", async () => {
    const caller = setup();
    mockPrisma.workOrderTicket.count.mockResolvedValue(0);
    mockPrisma.workOrderTicket.findMany.mockResolvedValue([]);

    await caller.getMany({
      tab: "suggested",
      page: 1,
      pageSize: 5,
      search: "",
      sort: "",
      lastUpdatedStartTime: "",
      lastUpdatedEndTime: "",
    });

    const include =
      mockPrisma.workOrderTicket.findMany.mock.calls[0][0].include;
    expect(include.watchers).toEqual({
      where: { userId: FAKE_USER_ID },
      select: { userId: true },
    });
    expect(include.seenBy).toEqual({
      where: { userId: FAKE_USER_ID },
      select: { seenAt: true },
    });
    expect(include.children.include.watchers).toEqual({
      where: { userId: FAKE_USER_ID },
      select: { userId: true },
    });
    expect(include.children.include.seenBy).toEqual({
      where: { userId: FAKE_USER_ID },
      select: { seenAt: true },
    });
  });

  it("collapses watchers into isWatching on parents and children", async () => {
    const caller = setup();
    const baseTicket = {
      _count: {
        comments: 0,
        issues: 0,
        vulnerabilities: 0,
        remediations: 0,
        advisories: 0,
        assets: 0,
      },
      vulnerabilities: [],
      assets: [],
      children: [],
      watchers: [],
      seenBy: [],
      lastCommentAt: null,
    };
    mockPrisma.workOrderTicket.count.mockResolvedValue(1);
    mockPrisma.workOrderTicket.findMany.mockResolvedValue([
      {
        id: "t1",
        ...baseTicket,
        watchers: [{ userId: FAKE_USER_ID }],
        children: [{ id: "c1", ...baseTicket, watchers: [] }],
      },
    ]);

    const result = await caller.getMany({
      tab: "suggested",
      page: 1,
      pageSize: 5,
      search: "",
      sort: "",
      lastUpdatedStartTime: "",
      lastUpdatedEndTime: "",
    });

    expect(result.items[0]).toMatchObject({ id: "t1", isWatching: true });
    expect(result.items[0]).not.toHaveProperty("watchers");
    expect(result.items[0]).not.toHaveProperty("seenBy");
    expect(result.items[0].children[0]).toMatchObject({
      id: "c1",
      isWatching: false,
    });
    expect(result.items[0].children[0]).not.toHaveProperty("watchers");
  });

  it("flags unread comments when the latest comment is newer than seenAt", async () => {
    const caller = setup();
    const base = {
      _count: {
        comments: 1,
        issues: 0,
        vulnerabilities: 0,
        remediations: 0,
        advisories: 0,
        assets: 0,
      },
      vulnerabilities: [],
      assets: [],
      children: [],
      watchers: [],
    };
    mockPrisma.workOrderTicket.count.mockResolvedValue(2);
    mockPrisma.workOrderTicket.findMany.mockResolvedValue([
      {
        id: "unread",
        ...base,
        lastCommentAt: new Date("2026-05-20T00:00:00Z"),
        seenBy: [{ seenAt: new Date("2026-05-10T00:00:00Z") }],
      },
      {
        id: "read",
        ...base,
        lastCommentAt: new Date("2026-05-05T00:00:00Z"),
        seenBy: [{ seenAt: new Date("2026-05-10T00:00:00Z") }],
      },
    ]);

    const result = await caller.getMany({
      tab: "suggested",
      page: 1,
      pageSize: 5,
      search: "",
      sort: "",
      lastUpdatedStartTime: "",
      lastUpdatedEndTime: "",
    });

    expect(result.items[0]).toMatchObject({
      id: "unread",
      hasUnreadComments: true,
    });
    expect(result.items[1]).toMatchObject({
      id: "read",
      hasUnreadComments: false,
    });
  });
});

describe("trackingRouter.markSeen", () => {
  it("upserts a TicketSeen row for (current user, ticket)", async () => {
    const caller = setup();
    mockPrisma.ticketSeen.upsert.mockResolvedValue({});

    await caller.markSeen({ ticketId: "t1" });

    expect(mockPrisma.ticketSeen.upsert).toHaveBeenCalledTimes(1);
    const arg = mockPrisma.ticketSeen.upsert.mock.calls[0][0];
    expect(arg.where).toEqual({
      userId_ticketId: { userId: FAKE_USER_ID, ticketId: "t1" },
    });
    expect(arg.create.seenAt).toBeInstanceOf(Date);
    expect(arg.update.seenAt).toBeInstanceOf(Date);
  });

  it("throws UNAUTHORIZED when not authenticated", async () => {
    mockGetSession.mockResolvedValue(null);
    // biome-ignore lint/suspicious/noExplicitAny: stub req
    const caller = createCaller({ req: {} as any });

    await expect(caller.markSeen({ ticketId: "t1" })).rejects.toThrow();
    expect(mockPrisma.ticketSeen.upsert).not.toHaveBeenCalled();
  });
});

describe("trackingRouter.setWatching", () => {
  it("upserts a TicketWatch row when watching is true", async () => {
    const caller = setup();
    mockPrisma.ticketWatch.upsert.mockResolvedValue({});

    await caller.setWatching({ ticketId: "t1", watching: true });

    expect(mockPrisma.ticketWatch.upsert).toHaveBeenCalledTimes(1);
    const arg = mockPrisma.ticketWatch.upsert.mock.calls[0][0];
    expect(arg.where).toEqual({
      userId_ticketId: { userId: FAKE_USER_ID, ticketId: "t1" },
    });
    expect(arg.create).toMatchObject({
      userId: FAKE_USER_ID,
      ticketId: "t1",
    });
    expect(mockPrisma.ticketWatch.deleteMany).not.toHaveBeenCalled();
  });

  it("deletes the TicketWatch row when watching is false", async () => {
    const caller = setup();
    mockPrisma.ticketWatch.deleteMany.mockResolvedValue({ count: 1 });

    await caller.setWatching({ ticketId: "t1", watching: false });

    expect(mockPrisma.ticketWatch.deleteMany).toHaveBeenCalledTimes(1);
    expect(mockPrisma.ticketWatch.deleteMany.mock.calls[0][0]).toEqual({
      where: { userId: FAKE_USER_ID, ticketId: "t1" },
    });
    expect(mockPrisma.ticketWatch.upsert).not.toHaveBeenCalled();
  });

  it("throws UNAUTHORIZED when not authenticated", async () => {
    mockGetSession.mockResolvedValue(null);
    // biome-ignore lint/suspicious/noExplicitAny: stub req
    const caller = createCaller({ req: {} as any });

    await expect(
      caller.setWatching({ ticketId: "t1", watching: true }),
    ).rejects.toThrow();
    expect(mockPrisma.ticketWatch.upsert).not.toHaveBeenCalled();
  });
});

describe("trackingRouter sort param", () => {
  const baseGetManyInput = {
    tab: "suggested" as const,
    page: 1,
    pageSize: 5,
    search: "",
    sort: "",
    lastUpdatedStartTime: "",
    lastUpdatedEndTime: "",
  };

  const baseListInput = {
    page: 1,
    pageSize: 25,
    search: "",
    sort: "",
    lastUpdatedStartTime: "",
    lastUpdatedEndTime: "",
  };

  const emptyResults = () => {
    mockPrisma.workOrderTicket.count.mockResolvedValue(0);
    mockPrisma.workOrderTicket.findMany.mockResolvedValue([]);
  };

  describe("getMany", () => {
    it("defaults to updatedAt desc when sort is empty", async () => {
      const caller = setup();
      emptyResults();
      await caller.getMany(baseGetManyInput);
      expect(
        mockPrisma.workOrderTicket.findMany.mock.calls[0][0].orderBy,
      ).toEqual([{ updatedAt: "desc" }]);
    });

    it("parses a single ascending field", async () => {
      const caller = setup();
      emptyResults();
      await caller.getMany({ ...baseGetManyInput, sort: "summary" });
      expect(
        mockPrisma.workOrderTicket.findMany.mock.calls[0][0].orderBy,
      ).toEqual([{ summary: "asc" }]);
    });

    it("treats a leading dash as descending", async () => {
      const caller = setup();
      emptyResults();
      await caller.getMany({ ...baseGetManyInput, sort: "-createdAt" });
      expect(
        mockPrisma.workOrderTicket.findMany.mock.calls[0][0].orderBy,
      ).toEqual([{ createdAt: "desc" }]);
    });

    it("parses multi-column sort preserving order", async () => {
      const caller = setup();
      emptyResults();
      await caller.getMany({
        ...baseGetManyInput,
        sort: "status,-updatedAt",
      });
      expect(
        mockPrisma.workOrderTicket.findMany.mock.calls[0][0].orderBy,
      ).toEqual([{ status: "asc" }, { updatedAt: "desc" }]);
    });

    it("drops fields that aren't on the whitelist", async () => {
      const caller = setup();
      emptyResults();
      await caller.getMany({
        ...baseGetManyInput,
        sort: "summary,assigneeName",
      });
      expect(
        mockPrisma.workOrderTicket.findMany.mock.calls[0][0].orderBy,
      ).toEqual([{ summary: "asc" }]);
    });

    it("falls back to the default when every requested field is invalid", async () => {
      const caller = setup();
      emptyResults();
      await caller.getMany({ ...baseGetManyInput, sort: "wholeNonsense" });
      expect(
        mockPrisma.workOrderTicket.findMany.mock.calls[0][0].orderBy,
      ).toEqual([{ updatedAt: "desc" }]);
    });
  });

  describe("list", () => {
    it("forwards the parsed sort to findMany", async () => {
      const caller = setup();
      emptyResults();
      await caller.list({ ...baseListInput, sort: "-scheduledAt" });
      expect(
        mockPrisma.workOrderTicket.findMany.mock.calls[0][0].orderBy,
      ).toEqual([{ scheduledAt: "desc" }]);
    });

    it("defaults to updatedAt desc when sort is empty", async () => {
      const caller = setup();
      emptyResults();
      await caller.list(baseListInput);
      expect(
        mockPrisma.workOrderTicket.findMany.mock.calls[0][0].orderBy,
      ).toEqual([{ updatedAt: "desc" }]);
    });
  });
});

describe("trackingRouter.attachChild", () => {
  it("sets parentId on the child ticket when it has no sub-tickets of its own", async () => {
    const caller = setup();
    mockPrisma.workOrderTicket.findUnique.mockResolvedValue({
      _count: { children: 0 },
    });
    mockPrisma.workOrderTicket.update.mockResolvedValue({ id: "c1" });

    await caller.attachChild({ parentId: "p1", childId: "c1" });

    expect(mockPrisma.workOrderTicket.update).toHaveBeenCalledWith({
      where: { id: "c1" },
      data: { parentId: "p1" },
    });
  });

  it("rejects self-attachment", async () => {
    const caller = setup();
    await expect(
      caller.attachChild({ parentId: "t1", childId: "t1" }),
    ).rejects.toThrow(/own sub-ticket/i);
    expect(mockPrisma.workOrderTicket.findUnique).not.toHaveBeenCalled();
    expect(mockPrisma.workOrderTicket.update).not.toHaveBeenCalled();
  });

  it("rejects attaching a ticket that already has its own sub-tickets", async () => {
    const caller = setup();
    mockPrisma.workOrderTicket.findUnique.mockResolvedValue({
      _count: { children: 2 },
    });

    await expect(
      caller.attachChild({ parentId: "p1", childId: "c1" }),
    ).rejects.toThrow(/already has sub-tickets/i);
    expect(mockPrisma.workOrderTicket.update).not.toHaveBeenCalled();
  });

  it("returns NOT_FOUND when the candidate child does not exist", async () => {
    const caller = setup();
    mockPrisma.workOrderTicket.findUnique.mockResolvedValue(null);

    await expect(
      caller.attachChild({ parentId: "p1", childId: "missing" }),
    ).rejects.toThrow(/not found/i);
    expect(mockPrisma.workOrderTicket.update).not.toHaveBeenCalled();
  });
});

describe("trackingRouter.detachChild", () => {
  it("clears parentId on the given ticket", async () => {
    const caller = setup();
    mockPrisma.workOrderTicket.update.mockResolvedValue({ id: "c1" });

    await caller.detachChild({ ticketId: "c1" });

    expect(mockPrisma.workOrderTicket.update).toHaveBeenCalledWith({
      where: { id: "c1" },
      data: { parentId: null },
    });
  });
});

describe("trackingRouter.listAttachableChildren", () => {
  it("excludes the parent itself and any ticket that already has children", async () => {
    const caller = setup();
    mockPrisma.workOrderTicket.findMany.mockResolvedValue([]);

    await caller.listAttachableChildren({ parentId: "p1" });

    const arg = mockPrisma.workOrderTicket.findMany.mock.calls[0][0];
    expect(arg.where).toEqual({
      id: { not: "p1" },
      children: { none: {} },
    });
    expect(arg.select.parent).toEqual({
      select: { id: true, summary: true },
    });
    expect(arg.take).toBe(100);
  });

  it("orders no-parent tickets first (alphabetically) then parented ones (alphabetically)", async () => {
    const caller = setup();
    mockPrisma.workOrderTicket.findMany.mockResolvedValue([
      {
        id: "charlie",
        summary: "Charlie",
        status: "TO_DO",
        parent: { id: "p2", summary: "P2" },
      },
      {
        id: "delta",
        summary: "Delta",
        status: "TO_DO",
        parent: null,
      },
      {
        id: "alpha",
        summary: "Alpha",
        status: "TO_DO",
        parent: { id: "p2", summary: "P2" },
      },
      {
        id: "bravo",
        summary: "Bravo",
        status: "TO_DO",
        parent: null,
      },
    ]);

    const result = await caller.listAttachableChildren({ parentId: "p1" });

    expect(result.map((t) => t.id)).toEqual([
      // No parent, alphabetical
      "bravo",
      "delta",
      // Has parent, alphabetical
      "alpha",
      "charlie",
    ]);
  });
});

describe("trackingRouter.attachAsset", () => {
  it("connects the asset to the ticket via the m2m relation", async () => {
    const caller = setup();
    mockPrisma.workOrderTicket.update.mockResolvedValue(makeTicketDetail());

    await caller.attachAsset({ ticketId: "t1", assetId: "a1" });

    expect(mockPrisma.workOrderTicket.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "t1" },
        data: { assets: { connect: { id: "a1" } } },
      }),
    );
  });
});

describe("trackingRouter.detachAsset", () => {
  it("disconnects the asset from the ticket", async () => {
    const caller = setup();
    mockPrisma.workOrderTicket.update.mockResolvedValue(makeTicketDetail());

    await caller.detachAsset({ ticketId: "t1", assetId: "a1" });

    expect(mockPrisma.workOrderTicket.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "t1" },
        data: { assets: { disconnect: { id: "a1" } } },
      }),
    );
  });
});

describe("trackingRouter.listAttachableAssets", () => {
  it("returns assets that are not already attached to this ticket", async () => {
    const caller = setup();
    mockPrisma.asset.findMany.mockResolvedValue([]);

    await caller.listAttachableAssets({ ticketId: "t1" });

    const arg = mockPrisma.asset.findMany.mock.calls[0][0];
    expect(arg.where).toEqual({
      workOrderTickets: { none: { id: "t1" } },
    });
    expect(arg.take).toBe(100);
    expect(arg.orderBy).toEqual([{ hostname: "asc" }, { ip: "asc" }]);
  });
});

describe("activity writes", () => {
  it("writes one STATUS_CHANGED activity row when status changes", async () => {
    const caller = setup();
    mockPrisma.workOrderTicket.findUnique.mockResolvedValue(
      makeUpdateBefore({ status: "TO_DO" }),
    );

    await caller.update({ id: "t1", status: "IN_PROGRESS" });

    expect(mockPrisma.ticketActivity.createMany).toHaveBeenCalledTimes(1);
    const [arg] = mockPrisma.ticketActivity.createMany.mock.calls[0];
    expect(arg.data).toEqual([
      expect.objectContaining({
        ticketId: "t1",
        userId: FAKE_USER_ID,
        type: "STATUS_CHANGED",
        data: { from: "TO_DO", to: "IN_PROGRESS" },
      }),
    ]);
  });

  it("writes nothing when the update is a no-op (status unchanged)", async () => {
    const caller = setup();
    mockPrisma.workOrderTicket.findUnique.mockResolvedValue(
      makeUpdateBefore({ status: "TO_DO" }),
    );

    await caller.update({ id: "t1", status: "TO_DO" });

    expect(mockPrisma.ticketActivity.createMany).not.toHaveBeenCalled();
  });

  it("records assignee changes with before/after user snapshots", async () => {
    const caller = setup();
    mockPrisma.workOrderTicket.findUnique.mockResolvedValue(
      makeUpdateBefore({
        assigneeId: "u1",
        assignee: { id: "u1", name: "Alice" },
      }),
    );
    mockPrisma.user.findUnique.mockResolvedValueOnce({
      id: "u2",
      name: "Bob",
    });

    await caller.update({ id: "t1", assigneeId: "u2" });

    const [arg] = mockPrisma.ticketActivity.createMany.mock.calls[0];
    expect(arg.data[0]).toMatchObject({
      type: "ASSIGNEE_CHANGED",
      data: {
        from: { id: "u1", name: "Alice" },
        to: { id: "u2", name: "Bob" },
      },
    });

    // The new assignee is auto-added as a watcher.
    expect(mockPrisma.ticketWatch.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          userId_ticketId: { userId: "u2", ticketId: "t1" },
        },
      }),
    );
  });

  it("records department add/remove diffs", async () => {
    const caller = setup();
    mockPrisma.workOrderTicket.findUnique.mockResolvedValue(
      makeUpdateBefore({
        departments: [
          { id: "d-old", name: "Old", color: null },
          { id: "d-keep", name: "Keep", color: null },
        ],
      }),
    );
    mockPrisma.department.findMany.mockResolvedValueOnce([
      { id: "d-new", name: "New", color: "blue" },
    ]);

    await caller.update({
      id: "t1",
      departmentIds: ["d-keep", "d-new"],
    });

    const [arg] = mockPrisma.ticketActivity.createMany.mock.calls[0];
    expect(arg.data[0]).toMatchObject({
      type: "DEPARTMENTS_CHANGED",
      data: {
        added: [{ id: "d-new", name: "New", color: "blue" }],
        removed: [{ id: "d-old", name: "Old", color: null }],
      },
    });
  });

  it("records CHILD_ATTACHED with the child's summary snapshot", async () => {
    const caller = setup();
    // First findUnique = child-children-count check, second = activity helper
    mockPrisma.workOrderTicket.findUnique
      .mockResolvedValueOnce({ _count: { children: 0 } })
      .mockResolvedValueOnce({ id: "c1", summary: "Patch ICU pumps" });

    await caller.attachChild({ parentId: "p1", childId: "c1" });

    expect(mockPrisma.ticketActivity.create).toHaveBeenCalledWith({
      data: {
        ticketId: "p1",
        userId: FAKE_USER_ID,
        type: "CHILD_ATTACHED",
        data: { childId: "c1", childSummary: "Patch ICU pumps" },
      },
    });
  });

  it("records ASSET_ATTACHED with the asset's hostname snapshot", async () => {
    const caller = setup();
    mockPrisma.asset.findUnique.mockResolvedValueOnce({
      id: "a1",
      hostname: "host-icu-1",
      ip: "10.0.0.1",
    });

    await caller.attachAsset({ ticketId: "t1", assetId: "a1" });

    expect(mockPrisma.ticketActivity.create).toHaveBeenCalledWith({
      data: {
        ticketId: "t1",
        userId: FAKE_USER_ID,
        type: "ASSET_ATTACHED",
        data: { assetId: "a1", assetLabel: "host-icu-1" },
      },
    });
  });

  it("records ASSET_DETACHED falling back to IP when hostname is null", async () => {
    const caller = setup();
    mockPrisma.asset.findUnique.mockResolvedValueOnce({
      id: "a1",
      hostname: null,
      ip: "10.0.0.42",
    });

    await caller.detachAsset({ ticketId: "t1", assetId: "a1" });

    expect(mockPrisma.ticketActivity.create).toHaveBeenCalledWith({
      data: {
        ticketId: "t1",
        userId: FAKE_USER_ID,
        type: "ASSET_DETACHED",
        data: { assetId: "a1", assetLabel: "10.0.0.42" },
      },
    });
  });
});
