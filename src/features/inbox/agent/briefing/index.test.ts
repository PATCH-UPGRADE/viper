// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const invoke = vi.fn();
vi.mock("@langchain/anthropic", () => ({
  ChatAnthropic: class {
    withStructuredOutput() {
      return { invoke };
    }
  },
}));

const { generateBriefing } = await import("./index");

const goldenSection = {
  exposure: "Unpatched pumps are reachable from the clinical VLAN.",
  whyThisPlan: "Closes the CVE across all pumps in one pass.",
  whyNow: "Vendor confirms exploitation in the wild.",
};
const goldenGenerated = {
  ciso: goldenSection,
  cmio: goldenSection,
  deptHead: goldenSection,
};

const plan = {
  title: "Segment pumps",
  summary: "Isolate on VLAN 220",
  compareLine: null,
  cards: {},
  isRecommended: true,
  recommendedPlan: null,
  workOrders: [],
};

beforeEach(() => invoke.mockReset());

describe("generateBriefing", () => {
  it("returns the parsed briefing on a clean response", async () => {
    invoke.mockResolvedValueOnce(goldenGenerated);

    const result = await generateBriefing(plan);
    expect(result.ciso).toContain("Unpatched pumps");
    expect(invoke).toHaveBeenCalledTimes(1);
  });

  it("retries once, more concisely, after a parse failure", async () => {
    invoke
      .mockRejectedValueOnce(new Error("failed to parse"))
      .mockResolvedValueOnce(goldenGenerated);

    const result = await generateBriefing(plan);
    expect(result.ciso).toContain("Unpatched pumps");
    expect(invoke.mock.calls[1][0].at(-1).content).toMatch(/cut off/);
  });

  it("throws if the retry also fails", async () => {
    invoke
      .mockRejectedValueOnce(new Error("first"))
      .mockRejectedValueOnce(new Error("still broken"));

    await expect(generateBriefing(plan)).rejects.toThrow("still broken");
    expect(invoke).toHaveBeenCalledTimes(2);
  });
});
