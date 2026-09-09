// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildChatGraph } from "@/features/agents/chat/graph";
import { streamGraphToUI } from "@/features/agents/shared/stream-bridge";
import { getSession } from "@/lib/auth-utils";
import { POST } from "./route";

const { db } = vi.hoisted(() => ({
  db: {
    chatThread: { upsert: vi.fn(), update: vi.fn() },
    chatMessage: {
      upsert: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      count: vi.fn(),
    },
  },
}));
vi.mock("@/lib/db", () => ({ default: db }));
vi.mock("@/lib/auth-utils", () => ({ getSession: vi.fn() }));
vi.mock("@/features/agents/chat/graph", () => ({ buildChatGraph: vi.fn() }));
vi.mock("@/features/agents/recommendations/graph", () => ({
  buildRecommendationsGraph: vi.fn(),
}));
vi.mock("@/features/agents/shared/generate-thread-title", () => ({
  generateThreadTitle: vi.fn().mockResolvedValue("Report title"),
}));
vi.mock("@/features/agents/shared/stream-bridge", () => ({
  streamGraphToUI: vi.fn(),
}));

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getSession).mockResolvedValue({
    user: { id: "owner" },
  } as Awaited<ReturnType<typeof getSession>>);
  db.chatThread.upsert.mockResolvedValue({ report: "# Current report" });
  db.chatMessage.findMany.mockResolvedValue([]);
  db.chatMessage.count.mockResolvedValue(1);
  vi.mocked(streamGraphToUI).mockImplementation(async ({ writer }) => {
    writer.write({ type: "text-start", id: "reply" });
    writer.write({ type: "text-delta", id: "reply", delta: "Saved." });
    writer.write({ type: "text-end", id: "reply" });
  });
});

function request() {
  return new Request("http://localhost/api/chat", {
    method: "POST",
    body: JSON.stringify({
      threadId: "thread",
      messages: [
        { id: "turn", role: "user", parts: [{ type: "text", text: "Revise" }] },
      ],
    }),
  });
}

describe("report chat authorization and persistence", () => {
  it("preloads the owner's current report and persists the normal reply and title", async () => {
    const response = await POST(request());
    expect(await response.text()).toContain("Saved.");
    expect(db.chatThread.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "thread", userId: "owner" } }),
    );
    expect(buildChatGraph).toHaveBeenCalledWith(
      expect.objectContaining({
        report: "# Current report",
        threadId: "thread",
      }),
    );
    expect(db.chatMessage.create).toHaveBeenCalledWith({
      data: {
        threadId: "thread",
        role: "ASSISTANT",
        content: "Saved.",
        toolCalls: undefined,
      },
    });
    expect(db.chatThread.update).toHaveBeenCalledWith({
      where: { id: "thread", userId: "owner" },
      data: { title: "Report title" },
    });
  });

  it("does not load history, run the agent, or finalize a rejected thread", async () => {
    // Prisma cannot create an already-owned id when the owner-scoped upsert misses.
    db.chatThread.upsert.mockRejectedValue(new Error("Thread unavailable"));
    const response = await POST(request());
    expect(await response.text()).toContain("Thread unavailable");
    expect(db.chatMessage.upsert).not.toHaveBeenCalled();
    expect(db.chatMessage.findMany).not.toHaveBeenCalled();
    expect(buildChatGraph).not.toHaveBeenCalled();
    expect(db.chatMessage.create).not.toHaveBeenCalled();
    expect(db.chatMessage.count).not.toHaveBeenCalled();
    expect(db.chatThread.update).not.toHaveBeenCalled();
  });

  it("rejects an unauthenticated request before touching the database", async () => {
    vi.mocked(getSession).mockResolvedValue(null);
    expect((await POST(request())).status).toBe(401);
    expect(db.chatThread.upsert).not.toHaveBeenCalled();
  });
});
