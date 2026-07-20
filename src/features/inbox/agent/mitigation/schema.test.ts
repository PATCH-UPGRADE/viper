// @vitest-environment node
import { describe, expect, it } from "vitest";
import { mitigationPlansSchema } from "./schema";

const goldenPlan = {
  shortDescription: "Contain now, patch on schedule",
  summary:
    "Block the attack path at the network today with zero downtime, then schedule firmware updates for the permanent fix.",
  compareLine: "Attack path closed immediately; vulnerable code removed later.",
  tags: ["NETWORK_SEGMENTATION", "VENDOR_FIX", "NEEDS_VENDOR"],
  cards: {
    effort: "2 tickets · ~14 hrs total",
    downtime: "None to contain",
    residual_risk: "Low",
    coverage: "6 of 6 assets",
    timeline: "Contained today · patched in ~2 weeks",
  },
  workOrders: [
    {
      shortDescription: "Block TCP 32912/32914 at the imaging VLAN boundary",
      detailedDescription:
        "Add deny rules for TCP 32912 and 32914 inbound to the imaging VLAN.",
    },
  ],
};

describe("mitigationPlansSchema", () => {
  it("accepts a well-formed, ordered plan list", () => {
    const parsed = mitigationPlansSchema.safeParse({ plans: [goldenPlan] });
    expect(parsed.success).toBe(true);
  });

  it("accepts an empty plan list (agent declined to propose any)", () => {
    const parsed = mitigationPlansSchema.safeParse({ plans: [] });
    expect(parsed.success).toBe(true);
  });

  it("rejects an unknown tag", () => {
    const parsed = mitigationPlansSchema.safeParse({
      plans: [{ ...goldenPlan, tags: ["NOT_A_REAL_TAG"] }],
    });
    expect(parsed.success).toBe(false);
  });

  it("rejects a plan missing a required card", () => {
    const partialCards = {
      effort: goldenPlan.cards.effort,
      downtime: goldenPlan.cards.downtime,
      coverage: goldenPlan.cards.coverage,
      timeline: goldenPlan.cards.timeline,
    };
    const parsed = mitigationPlansSchema.safeParse({
      plans: [{ ...goldenPlan, cards: partialCards }],
    });
    expect(parsed.success).toBe(false);
  });
});
