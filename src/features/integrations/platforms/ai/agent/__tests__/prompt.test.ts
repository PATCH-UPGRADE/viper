// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { ResourceType } from "@/generated/prisma";
import { FETCH_URL_TOOL } from "../fetch-tool";
import { buildCrawlerPreload, buildCrawlerPrompt } from "../prompt";
import { RECORD_ITEMS_TOOL } from "../record-tool";

const URI = "https://nvgd.example.com/api/devices";

describe.each([
  [ResourceType.Asset, "ip is required"],
  [ResourceType.Vulnerability, "cpes is required"],
  [ResourceType.Remediation, "artifacts is required"],
  [ResourceType.DeviceArtifact, "cpe is required"],
] as const)("crawler prompt for %s", (resource, requiredField) => {
  const prompt = buildCrawlerPrompt({ resource, integrationUri: URI });

  it("names both tools and the integration URL", () => {
    expect(prompt).toContain(FETCH_URL_TOOL);
    expect(prompt).toContain(RECORD_ITEMS_TOOL);
    expect(prompt).toContain(URI);
  });

  it("gives the required fields for the resource", () => {
    expect(prompt).toContain(requiredField);
  });

  it("tells the model how to report a source with no items", () => {
    expect(prompt).toMatch(/empty list/);
  });

  // An unstable externalId can create a second row for the same item on every sync.
  it("asks for externalIds that stay the same across syncs and retries", () => {
    expect(prompt).toContain("same every time the same item is crawled");
    expect(prompt).toContain("never add counters or suffixes of your own");
    expect(prompt).toContain("Record each item once");
  });
});

describe("operator instructions", () => {
  it("adds them in a labeled block", () => {
    const prompt = buildCrawlerPrompt({
      resource: ResourceType.Asset,
      integrationUri: URI,
      additionalInstructions: "  Use ?limit=100 and follow links.next.  ",
    });

    expect(prompt).toContain(
      "<operator_instructions>\nUse ?limit=100 and follow links.next.\n</operator_instructions>",
    );
  });

  it("leaves the block out when there are none", () => {
    for (const additionalInstructions of [undefined, "   "]) {
      const prompt = buildCrawlerPrompt({
        resource: ResourceType.Asset,
        integrationUri: URI,
        additionalInstructions,
      });
      expect(prompt).not.toContain("operator_instructions");
    }
  });
});

describe("crawler preload", () => {
  const base = {
    resource: ResourceType.Vulnerability,
    integrationUri: URI,
    authType: "Bearer",
  } as const;

  it("names the resource, URL, and auth type, and no secret", () => {
    const preload = buildCrawlerPreload({ ...base, knownExternalIds: [] });

    expect(preload).toBe(
      `Resource: Vulnerability\nIntegration URL: ${URI}\nAuthentication: Bearer`,
    );
  });

  // Without earlier ids, each sync picks its own pattern and can copy every item.
  it("lists earlier externalIds and asks for the same pattern", () => {
    const preload = buildCrawlerPreload({
      ...base,
      knownExternalIds: ["dg_1:fuzzer:CWE-798:0", "dg_2:fuzzer:CWE-200:1"],
    });

    expect(preload).toContain(
      "- dg_1:fuzzer:CWE-798:0\n- dg_2:fuzzer:CWE-200:1",
    );
    expect(preload).toContain("exactly the same pattern");
  });
});
