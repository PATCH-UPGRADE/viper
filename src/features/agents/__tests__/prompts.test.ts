// @vitest-environment node
import { describe, expect, it } from "vitest";

import { USER_ROLES } from "@/features/chat/utils";
import { buildSystemPrompt as chatPrompt } from "../chat/graph";
import { buildSystemPrompt as recommendationsPrompt } from "../recommendations/graph";

/**
 * Every conversational agent binds the same tool set, so a tool the registry
 * gains or loses must be reflected in both prompts. Nothing else enforces that,
 * and a prompt describing a tool that no longer exists stays invisible until a
 * model calls it and the turn fails.
 *
 * These assert the facts the work order flow depends on, not the wording. A full
 * snapshot would fail on every edit and teach reviewers to re-bless it unread.
 */
// Any role: the work order guidance is role-independent.
const ROLE = USER_ROLES[0];
const PROMPTS: [string, string][] = [
  ["chat", chatPrompt(ROLE)],
  ["recommendations", recommendationsPrompt(ROLE)],
];

describe.each(PROMPTS)("%s agent prompt", (_name, prompt) => {
  it("names both work order tools", () => {
    expect(prompt).toContain("list_work_order_targets");
    expect(prompt).toContain("propose_work_order");
  });

  it("names no platform-specific tool that no longer exists", () => {
    expect(prompt).not.toContain("propose_fleet_work_order");
    expect(prompt).not.toContain("list_fleet_managed_assets");
  });

  it("tells the model to discover the target and its fields first", () => {
    expect(prompt.toLowerCase()).toContain("schema");
  });

  it("says an asset no platform manages is still worth proposing for", () => {
    expect(prompt).toContain("unmanaged");
    expect(prompt.toLowerCase()).toMatch(
      /tracked in viper|nothing (is sent|leaves)/,
    );
  });

  it("says a proposal files nothing until the user approves", () => {
    expect(prompt.toLowerCase()).toMatch(/creates nothing|not an action/);
    expect(prompt.toLowerCase()).toContain("approval");
  });

  it("tells the model a refusal carries its reason", () => {
    expect(prompt.toLowerCase()).toMatch(/refus/);
  });
});
