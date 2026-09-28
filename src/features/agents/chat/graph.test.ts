// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("../shared/build-graph", () => ({ buildAgentGraph: vi.fn() }));
vi.mock("@langchain/anthropic", () => ({
  ChatAnthropic: class {
    bindTools(tools: { name: string }[]) {
      return { boundToolNames: tools.map((tool) => tool.name) };
    }
  },
}));
vi.mock("@/lib/markdown", () => ({
  assetToMarkdown: () => "ASSET MARKDOWN",
  vulnerabilityToMarkdown: () => "VULNERABILITY MARKDOWN",
}));

import type { AssetWithIssueRelations } from "@/features/assets/types";
import type { VulnerabilityWithRelations } from "@/features/vulnerabilities/types";
import { buildAgentGraph } from "../shared/build-graph";
import { buildChatGraph, buildSystemPrompt } from "./graph";

beforeEach(() => vi.clearAllMocks());

const graphConfig = () => vi.mocked(buildAgentGraph).mock.calls[0][0];

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

  it("preloads notes only and registers the report tools", async () => {
    buildChatGraph({
      userId: "user",
      threadId: "thread",
      loadNotes: async () => "Hospital notes",
    });
    const config = graphConfig();
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

describe("chat system prompt — request_recommendation", () => {
  it("describes request_recommendation and tells the model to call it before fetching", () => {
    const prompt = buildSystemPrompt("hospital administration");
    expect(prompt).toMatch(
      /request_recommendation: hand the turn to the remediation advisor/,
    );
    expect(prompt).toMatch(/before fetching data or answering/);
    expect(prompt).toMatch(/follow-up to an\s+answer the advisor gave/);
  });

  // The advisor node has no edge back to the chat model and binds neither
  // record_note nor write_report, so a combined request loses that half unless
  // the chat model is told to handle it before handing the turn over.
  it("says what to do when the same message also asks for a note or a report", () => {
    const prompt = buildSystemPrompt("hospital administration");
    expect(prompt).toMatch(/can neither\s+record notes nor write reports/);
    expect(prompt).toMatch(/call\s+record_note before you hand off/);
    expect(prompt).toMatch(
      /say in your reply that you will write it when they ask again/,
    );
  });

  it("binds request_recommendation for the chat model and hands a recommendation node to the graph", () => {
    buildChatGraph({
      userId: "user",
      threadId: "thread",
      loadNotes: async () => "Hospital notes",
    });
    const config = graphConfig();
    expect(
      config.tools.some((tool) => tool.name === "request_recommendation"),
    ).toBe(true);
    expect(config.recommendation).toBeDefined();
    expect(config.recommendation?.systemMessage.content).toMatch(
      /remediation advisor for a hospital environment/,
    );
    expect(config.recommendation?.systemMessage.content).not.toContain(
      "request_recommendation",
    );
  });
});

describe("focus record", () => {
  const asset = { id: "asset-1" } as unknown as AssetWithIssueRelations;
  const vulnerability = {
    id: "vuln-1",
  } as unknown as VulnerabilityWithRelations;

  it("appends the asset the user has open to both prompts", () => {
    buildChatGraph({
      userId: "user",
      threadId: "thread",
      userRole: "IT staff",
      assetData: asset,
      loadNotes: async () => "Hospital notes",
    });
    const config = graphConfig();
    for (const prompt of [
      config.systemMessage.content,
      config.recommendation?.systemMessage.content,
    ]) {
      expect(prompt).toContain("<asset_focus>");
      expect(prompt).toContain("ASSET MARKDOWN");
      expect(prompt).toContain(
        "<role_focus_asset>The user is IT staff. Focus on technical details:",
      );
      expect(prompt).not.toContain("<vuln_focus>");
    }
  });

  it("appends the vulnerability the user has open to both prompts", () => {
    buildChatGraph({
      userId: "user",
      threadId: "thread",
      vulnerabilityData: vulnerability,
      loadNotes: async () => "Hospital notes",
    });
    const config = graphConfig();
    for (const prompt of [
      config.systemMessage.content,
      config.recommendation?.systemMessage.content,
    ]) {
      expect(prompt).toContain("<vuln_focus>");
      expect(prompt).toContain("VULNERABILITY MARKDOWN");
      expect(prompt).not.toContain("<asset_focus>");
    }
  });

  it("adds no focus block when the chat is not embedded in a drawer", () => {
    buildChatGraph({
      userId: "user",
      threadId: "thread",
      loadNotes: async () => "Hospital notes",
    });
    const config = graphConfig();
    expect(config.systemMessage.content).not.toMatch(
      /_focus>|<role_focus_(asset|vuln)/,
    );
    expect(config.recommendation?.systemMessage.content).not.toMatch(
      /_focus>|<role_focus_(asset|vuln)/,
    );
  });
});

describe("reports view", () => {
  type BoundModel = { boundToolNames: string[] };
  const recommendationToolNames = () =>
    (graphConfig().recommendation?.model as unknown as BoundModel)
      .boundToolNames;

  it("lets the recommendation node write the report on the reports view", () => {
    buildChatGraph({
      userId: "user",
      threadId: "thread",
      fromReports: true,
      loadNotes: async () => "Hospital notes",
    });
    expect(recommendationToolNames()).toContain("write_report");
    expect(graphConfig().recommendation?.systemMessage.content).toMatch(
      /write_report: create or replace/,
    );
  });

  it("keeps write_report away from the recommendation node outside the reports view", () => {
    buildChatGraph({
      userId: "user",
      threadId: "thread",
      loadNotes: async () => "Hospital notes",
    });
    expect(recommendationToolNames()).not.toContain("write_report");
    expect(graphConfig().recommendation?.systemMessage.content).toMatch(
      /you cannot write reports/,
    );
  });

  it("tells the chat model the advisor writes the report on the reports view", () => {
    const marker = /on this view the advisor writes the report itself/;
    expect(buildSystemPrompt("hospital administration", true)).toMatch(marker);
    expect(buildSystemPrompt("hospital administration")).not.toMatch(marker);
  });
});
