// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("../shared/build-graph", () => ({ buildAgentGraph: vi.fn() }));
vi.mock("@langchain/anthropic", () => ({
  ChatAnthropic: class {
    bindTools() {
      return {};
    }
  },
}));

import { buildAgentGraph } from "../shared/build-graph";
import { buildChatGraph, buildSystemPrompt } from "./graph";

beforeEach(() => vi.clearAllMocks());

describe("chat system prompt — write_report", () => {
  it("describes write_report in the tool list", () => {
    expect(buildSystemPrompt("hospital administration")).toMatch(
      /write_report: create or replace/,
    );
  });

  it("tells the model how to cite records and what happens to a bad citation", () => {
    const prompt = buildSystemPrompt("hospital administration");
    expect(prompt).toContain("[MRI-01](/assets/<id>)");
    expect(prompt).toMatch(/converted to plain text on save/);
  });

  it("tells the model to say so instead of leaving the report looking complete", () => {
    expect(buildSystemPrompt("hospital administration")).toMatch(
      /"Not available"/,
    );
  });

  it("adds the reports bias only when fromReports is set", () => {
    const marker = /<surface>The user is on the reports view/;
    expect(buildSystemPrompt("hospital administration", true)).toMatch(marker);
    expect(buildSystemPrompt("hospital administration")).not.toMatch(marker);
  });

  it("preloads notes only — never report content — and registers the report tools", async () => {
    buildChatGraph({
      userId: "user",
      threadId: "thread",
      loadNotes: async () => "Hospital notes",
    });
    const config = vi.mocked(buildAgentGraph).mock.calls[0][0];
    expect(await config.preload()).toBe("Hospital notes");
    for (const name of [
      "search_report",
      "read_report",
      "edit_report",
      "write_report",
    ]) {
      expect(config.tools.some((tool) => tool.name === name)).toBe(true);
    }
  });
});
