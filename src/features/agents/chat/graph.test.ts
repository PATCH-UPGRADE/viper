// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { buildSystemPrompt } from "./graph";

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

  it("omits the current-report section when there is no report yet", () => {
    expect(buildSystemPrompt("hospital administration")).not.toContain(
      "## Current report",
    );
  });

  it("feeds an existing report back for revision, verbatim", () => {
    const prompt = buildSystemPrompt(
      "hospital administration",
      "# CT Scanner Briefing\n\nExisting content.",
    );
    expect(prompt).toContain("## Current report");
    expect(prompt).toContain("# CT Scanner Briefing\n\nExisting content.");
    expect(prompt).toMatch(/revise that text, don't rebuild it from memory/);
  });
});
