// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  briefingSchema,
  type GeneratedBriefing,
  generatedBriefingSchema,
  renderBriefing,
} from "./schema";

const goldenSection = {
  exposure:
    "Both infusion pumps accept unauthenticated firmware commands over the clinical VLAN.",
  whyThisPlan:
    "Patching tonight closes the CVE across all 6 pumps in one pass.",
  whyNow: "Vendor confirms exploitation in the wild.",
};

const goldenGenerated: GeneratedBriefing = {
  ciso: goldenSection,
  cmio: goldenSection,
  deptHead: goldenSection,
};

describe("generatedBriefingSchema", () => {
  it("accepts a well-formed model response", () => {
    expect(generatedBriefingSchema.safeParse(goldenGenerated).success).toBe(
      true,
    );
  });

  it("rejects a response missing an audience", () => {
    const { deptHead: _deptHead, ...missingAudience } = goldenGenerated;
    expect(generatedBriefingSchema.safeParse(missingAudience).success).toBe(
      false,
    );
  });
});

describe("renderBriefing", () => {
  it("flattens each audience's sections into the persisted markdown shape", () => {
    const briefing = renderBriefing(goldenGenerated);

    expect(briefing.ciso).toBe(
      [
        "**Security exposure**\nBoth infusion pumps accept unauthenticated firmware commands over the clinical VLAN.",
        "**Why this plan, not the alternatives**\nPatching tonight closes the CVE across all 6 pumps in one pass.",
        "**Why now**\nVendor confirms exploitation in the wild.",
      ].join("\n\n"),
    );
    expect(briefingSchema.safeParse(briefing).success).toBe(true);
  });

  it("renders every audience declared on the generation schema, not a hardcoded subset", () => {
    const briefing = renderBriefing(goldenGenerated);
    expect(Object.keys(briefing).sort()).toEqual(
      Object.keys(goldenGenerated).sort(),
    );
  });
});
