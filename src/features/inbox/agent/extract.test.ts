// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ default: {} }));

import { extractSchema, keepWellFormedCveIds } from "./extract";

const empty = { deviceGroups: [], vulnerabilities: [], assets: [] };

describe("keepWellFormedCveIds", () => {
  it("accepts a malformed id in the structured output instead of failing the whole extraction", () => {
    const parsed = extractSchema.safeParse({
      ...empty,
      remediations: [{ linkedCveIds: ["CVE-2020-25175", "CVE-20-1"] }],
    });
    expect(parsed.success).toBe(true);
  });

  it("drops malformed ids and keeps the rest", () => {
    const result = keepWellFormedCveIds({
      ...empty,
      remediations: [
        {
          description: "patch it",
          linkedCveIds: [
            "CVE-2020-25175",
            "CVE-20-1",
            "GHSA-abc",
            "cve-2017-0144",
          ],
        },
      ],
    });
    expect(result.remediations).toEqual([
      {
        description: "patch it",
        linkedCveIds: ["CVE-2020-25175", "cve-2017-0144"],
      },
    ]);
  });

  it("returns no ids for a remediation that had none", () => {
    const result = keepWellFormedCveIds({
      ...empty,
      remediations: [{ description: "patch it", linkedCveIds: null }],
    });
    expect(result.remediations[0].linkedCveIds).toBeUndefined();
  });
});
