// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "@/lib/db";
import { loadHistoryMessages } from "./history";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({
  default: { chatMessage: { findMany: vi.fn() } },
}));

beforeEach(() => vi.resetAllMocks());

describe("loadHistoryMessages", () => {
  it("replays only message text, never stored tool-call payloads like a full-report write", async () => {
    const fullReport = "# Big report\n".repeat(1000);
    vi.mocked(prisma.chatMessage.findMany).mockResolvedValue([
      { role: "USER", content: "Write a report" },
      {
        role: "ASSISTANT",
        content: "Report saved.",
        toolCalls: [
          { type: "tool-write_report", input: { markdown: fullReport } },
        ],
      },
    ] as never);
    const messages = await loadHistoryMessages("thread");
    expect(messages.map((m) => m.content)).toEqual([
      "Write a report",
      "Report saved.",
    ]);
  });
});
