// @vitest-environment node
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * These assert on source text rather than behaviour, because a wrong model
 * setting typechecks, passes every unit test, and then fails against the live
 * API on the first scheduled sync.
 */
const src = fs.readFileSync(
  path.join(
    process.cwd(),
    "src/features/integrations/platforms/ai/agent/index.ts",
  ),
  "utf8",
);

describe("crawler model configuration", () => {
  it("uses adaptive thinking, the only mode Sonnet 5 accepts", () => {
    expect(src).toMatch(/thinking:\s*\{\s*type:\s*"adaptive"\s*\}/);
  });

  it("never sends budget_tokens or temperature, which Sonnet 5 rejects", () => {
    expect(src).not.toMatch(/budget_tokens\s*:/);
    expect(src).not.toMatch(/temperature\s*:/);
  });

  // The shared registry holds HALT_TOOLS, which end the run to wait for a person.
  it("binds only its own fetch and record tools", () => {
    expect(src).toMatch(/recorder = makeRecordItemsTool\(itemSchema\)/);
    expect(src).toMatch(
      /tools = \[\s*makeFetchUrlTool\([^)]*\),\s*recorder\.tool,?\s*\]/,
    );
    expect(src).not.toMatch(/buildAgentTools\s*\(/);
  });

  it("caches the repeated conversation prefix", () => {
    expect(src).toMatch(/bindTools\(tools,\s*CACHE_REPEATED_INPUT\)/);
  });

  it("raises the recursion limit above LangGraph's default of 25", () => {
    const declared = src.match(/CRAWLER_RECURSION_LIMIT\s*=\s*(\d+)/);
    expect(Number(declared?.[1])).toBeGreaterThan(25);
    expect(src).toMatch(/recursionLimit:\s*CRAWLER_RECURSION_LIMIT/);
  });
});
