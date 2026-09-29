// @vitest-environment node
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const read = (file: string) => readFileSync(join(__dirname, file), "utf8");

describe("chat graph super-step budget", () => {
  // The recommendation node makes a long run of retrieval calls before it
  // answers. On the default budget a broad question lands close to the ceiling,
  // and crossing it throws GraphRecursionError part-way through the reply.
  it("raises the recursion limit above LangGraph's default of 25", () => {
    const src = read("build-graph.ts");

    // The identifier alone proves nothing: a limit of 10 would still "contain"
    // it while making the run fail sooner than the default it replaced.
    const declared = src.match(/AGENT_RECURSION_LIMIT\s*=\s*(\d+)/);
    expect(declared).not.toBeNull();
    expect(Number(declared?.[1])).toBeGreaterThan(25);
  });

  it("passes the limit to the call that actually drives the graph", () => {
    expect(read("stream-bridge.ts")).toMatch(
      /recursionLimit:\s*AGENT_RECURSION_LIMIT/,
    );
  });
});
