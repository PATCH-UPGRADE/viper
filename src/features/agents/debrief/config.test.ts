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

  // Match the assignment, not the bare word. Both settings are worth explaining
  // in a comment, and a comment doing so must not fail the test that guards them.
  it("never sends budget_tokens, which Sonnet 5 rejects with a 400", () => {
    for (const file of ["writer.ts", "scout.ts"]) {
      expect(read(file)).not.toMatch(/budget_tokens\s*:/);
    }
  });

  it("never sets temperature, which Sonnet 5 also rejects", () => {
    for (const file of ["writer.ts", "scout.ts"]) {
      expect(read(file)).not.toMatch(/temperature\s*:/);
    }
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
    const src = read("scout.ts");

    // The identifier alone proves nothing: a limit of 10 would still "contain"
    // it while making the run fail sooner than the default it replaced.
    const declared = src.match(/SCOUT_RECURSION_LIMIT\s*=\s*(\d+)/);
    expect(declared).not.toBeNull();
    expect(Number(declared?.[1])).toBeGreaterThan(25);

    // ...and it has to actually reach graph.invoke.
    expect(src).toMatch(/recursionLimit:\s*SCOUT_RECURSION_LIMIT/);
  });
});
