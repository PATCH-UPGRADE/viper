// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import fs from "node:fs";
import path from "node:path";

/**
 * These assert on source text rather than behaviour, because both settings only
 * fail against the live API — a wrong value typechecks, passes every unit test,
 * and then throws on the first real run at 05:00 with nobody watching.
 */
const read = (file: string) =>
  fs.readFileSync(
    path.join(process.cwd(), "src/features/agents/debrief", file),
    "utf8",
  );

describe("writer model configuration", () => {
  // withStructuredOutput sends a forced tool_choice. LangChain only skips
  // forcing when thinking.type is explicitly "enabled"/"adaptive", and Sonnet 5
  // thinks by default when the field is omitted — so an unset `thinking` pairs
  // forced tool choice with thinking and the API rejects every call.
  it("disables thinking explicitly", () => {
    expect(read("writer.ts")).toMatch(
      /thinking:\s*\{\s*type:\s*"disabled"\s*\}/,
    );
  });

  it("never sends budget_tokens, which Sonnet 5 rejects with a 400", () => {
    expect(read("writer.ts")).not.toContain("budget_tokens");
    expect(read("scout.ts")).not.toContain("budget_tokens");
  });

  it("never sets temperature, which Sonnet 5 also rejects", () => {
    expect(read("writer.ts")).not.toContain("temperature");
    expect(read("scout.ts")).not.toContain("temperature");
  });
});

describe("scout model configuration", () => {
  it("uses adaptive thinking, the only mode Sonnet 5 accepts", () => {
    expect(read("scout.ts")).toMatch(
      /thinking:\s*\{\s*type:\s*"adaptive"\s*\}/,
    );
  });

  // The registry holds two HALT_TOOLS and a note writer. A nightly cron has
  // nobody to answer ask_user_questions, so binding it ends the run empty.
  it("binds only query_platform_data, never the shared registry", () => {
    const src = read("scout.ts");
    expect(src).toContain("makeQueryPlatformDataTool");
    // Match the import, not the word: the comment above the tool list explains
    // why the registry is wrong, so it names buildAgentTools deliberately.
    expect(src).not.toMatch(/import\s*\{[^}]*buildAgentTools/);
    expect(src).not.toMatch(/buildAgentTools\s*\(/);
  });

  it("raises the recursion limit above LangGraph's default of 25", () => {
    expect(read("scout.ts")).toContain("recursionLimit");
  });
});
