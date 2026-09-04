// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { PLATFORM_QUERY_PROCEDURES } from "@/features/agents/tools/query-platform-tool";
import { USER_ROLES } from "@/features/chat/utils";
import { buildSystemPrompt } from "./graph";

/**
 * How each allowlisted router prefix is named in prose. The prompt describes the
 * same domains in words that the allowlist names in dot-paths, so an entry here
 * is a reminder that both `<grounding_rules>` and `<tools>` need the new domain.
 */
const DOMAIN_PHRASES: Record<string, string> = {
  assets: "assets",
  vulnerabilities: "vulnerabilities",
  remediations: "remediations",
  deviceGroups: "device groups",
  workflows: "clinical workflows",
  notifications: "notifications",
};

const prefixes = () => [
  ...new Set(PLATFORM_QUERY_PROCEDURES.map((p) => p.split(".")[0])),
];

/**
 * The prose blocks, excluding the pasted catalog, which lists everything.
 *
 * Whitespace is collapsed because the prompt is hand-wrapped: "device groups"
 * really appears as "device\n  groups", so a raw substring check reports drift
 * that is only a line break.
 */
function proseBlocks(prompt: string) {
  const flatten = (text: string) => text.replace(/\s+/g, " ");
  const grounding = prompt.match(
    /<grounding_rules>([\s\S]*?)<\/grounding_rules>/,
  );
  const tools = prompt.match(/<tools>([\s\S]*?)<\/tools>/);
  return {
    grounding: flatten(grounding?.[1] ?? ""),
    tools: flatten(tools?.[1] ?? ""),
  };
}

describe("recommendations prompt stays in step with the tool allowlist", () => {
  // An agent that trusts a stale summary declines work the tool would have
  // answered, and nothing else fails when the two drift apart.
  it("names every allowlisted domain in <grounding_rules>", () => {
    const { grounding } = proseBlocks(buildSystemPrompt("CISO"));

    const missing = prefixes().filter((prefix) => {
      const phrase = DOMAIN_PHRASES[prefix];
      // An unmapped prefix is a new domain — fail, so both are updated together.
      return phrase === undefined || !grounding.includes(phrase);
    });

    expect(missing).toEqual([]);
  });

  it("names every allowlisted domain in the <tools> block", () => {
    const { tools } = proseBlocks(buildSystemPrompt("CISO"));

    const missing = prefixes().filter((prefix) => {
      const phrase = DOMAIN_PHRASES[prefix];
      return phrase === undefined || !tools.includes(phrase);
    });

    expect(missing).toEqual([]);
  });

  it("embeds the catalog, so procedure inputs cannot drift from the prompt", () => {
    const prompt = buildSystemPrompt("CISO");

    for (const procedure of PLATFORM_QUERY_PROCEDURES) {
      expect(prompt).toContain(procedure);
    }
  });
});

describe("recommendations prompt grounding rules", () => {
  // The whole point of the tool: answers come from retrieved records, not from
  // the model's prior. Losing these lines is how invented CVSS scores appear.
  it("forbids inventing the values a reader would act on", () => {
    const prompt = buildSystemPrompt("CISO");

    expect(prompt).toMatch(/Never invent CVSS scores/);
    expect(prompt).toMatch(/EPSS values, KEV status, asset IDs, hostnames/);
    expect(prompt).toMatch(/scheduling\s+windows/);
  });

  it("tells the model to say so when a fact cannot be retrieved", () => {
    expect(buildSystemPrompt("CISO")).toMatch(/say so explicitly/);
  });

  it("builds a prompt for every role, with that role's instructions", () => {
    for (const role of USER_ROLES) {
      const prompt = buildSystemPrompt(role);
      expect(prompt).toContain(`The user has the role ${role}`);
      expect(prompt.length).toBeGreaterThan(1000);
    }
  });
});
