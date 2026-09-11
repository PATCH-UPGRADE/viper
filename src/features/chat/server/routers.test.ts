// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { mockPrisma, mockGetSession } = vi.hoisted(() => ({
  mockPrisma: {
    chatThread: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      delete: vi.fn(),
    },
    chatReport: { delete: vi.fn() },
    chatMessage: { findMany: vi.fn() },
  },
  mockGetSession: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ default: mockPrisma }));
vi.mock("@/lib/auth-utils", () => ({
  getSession: mockGetSession,
  verifyApiKey: vi.fn(),
}));

import { createCallerFactory } from "@/trpc/init";
import { chatRouter } from "./routers";

const createCaller = createCallerFactory(chatRouter);
const FAKE_USER_ID = "user-test";

const setup = () => {
  mockGetSession.mockResolvedValue({
    user: { id: FAKE_USER_ID, email: "test@example.com" },
    session: { id: "s1", userId: FAKE_USER_ID },
  });
  // biome-ignore lint/suspicious/noExplicitAny: test stub for tRPC ctx
  return createCaller({ req: {} as any });
};

beforeEach(() => {
  vi.clearAllMocks();
});

// Regression for VW-512: a fresh /reports thread navigates to
// /reports/<uuid> with no ChatThread row. The dehydrated prefetch of these
// two queries must resolve gracefully, not reject (previously threw via
// prisma.chatThread.findUniqueOrThrow).
describe("chatRouter — rowless threadId", () => {
  it("getUIMessages returns empty history instead of throwing", async () => {
    const caller = setup();
    mockPrisma.chatThread.findFirst.mockResolvedValue(null);

    await expect(
      caller.getUIMessages({ threadId: "no-such-thread" }),
    ).resolves.toEqual({ messages: [] });
    expect(mockPrisma.chatMessage.findMany).not.toHaveBeenCalled();
  });

  it("getReportThread returns null report instead of throwing", async () => {
    const caller = setup();
    mockPrisma.chatThread.findFirst.mockResolvedValue(null);

    await expect(
      caller.getReportThread({ threadId: "no-such-thread" }),
    ).resolves.toEqual({ report: null, title: null });
  });

  it("getReportThread unwraps the ChatReport relation's content and title", async () => {
    const caller = setup();
    mockPrisma.chatThread.findFirst.mockResolvedValue({
      report: { content: "# Report", title: "CT Scanner Report" },
    });

    await expect(caller.getReportThread({ threadId: "t1" })).resolves.toEqual({
      report: "# Report",
      title: "CT Scanner Report",
    });
  });
});

// VW-512: the /reports sidebar lists every thread with a linked ChatReport,
// including blank ("") ones created up front by the "New" button. A thread with
// no ChatReport (an ordinary chat) is excluded by the `reportId: { not: null }`
// filter — Prisma enforces it, so the unit check is that the filter is passed.
describe("chatRouter — report thread list & creation", () => {
  it("getReportThreads filters on a linked report, not report content", async () => {
    const caller = setup();
    const row = (id: string, messages: number) => ({
      id,
      userId: FAKE_USER_ID,
      title: id,
      reportId: "report-1",
      createdAt: new Date(),
      updatedAt: new Date(),
      _count: { messages },
    });
    mockPrisma.chatThread.findMany.mockResolvedValue([
      row("blank", 0),
      row("written", 3),
    ]);

    const res = await caller.getReportThreads({ limit: 50 });

    expect(mockPrisma.chatThread.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: FAKE_USER_ID, reportId: { not: null } },
      }),
    );
    expect(res.threads.map((t) => t.id)).toEqual(["blank", "written"]);
  });

  it("deleteThread also deletes the thread's linked ChatReport", async () => {
    const caller = setup();
    mockPrisma.chatThread.findFirst.mockResolvedValue({ reportId: "rep-9" });

    await caller.deleteThread({ threadId: "t9" });

    expect(mockPrisma.chatThread.delete).toHaveBeenCalledWith({
      where: { id: "t9" },
    });
    expect(mockPrisma.chatReport.delete).toHaveBeenCalledWith({
      where: { id: "rep-9" },
    });
  });

  it("deleteThread skips the report delete when the thread has none", async () => {
    const caller = setup();
    mockPrisma.chatThread.findFirst.mockResolvedValue({ reportId: null });

    await caller.deleteThread({ threadId: "t10" });

    expect(mockPrisma.chatReport.delete).not.toHaveBeenCalled();
  });

  it("createReportThread creates the thread with a blank linked report", async () => {
    const caller = setup();
    mockPrisma.chatThread.create.mockResolvedValue({ id: "new-id" });

    await expect(
      caller.createReportThread({ threadId: "new-id" }),
    ).resolves.toEqual({ success: true });

    expect(mockPrisma.chatThread.create).toHaveBeenCalledWith({
      data: {
        id: "new-id",
        user: { connect: { id: FAKE_USER_ID } },
        report: { create: { content: "" } },
      },
    });
  });
});
