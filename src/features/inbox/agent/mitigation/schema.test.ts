// @vitest-environment node
import { describe, expect, it } from "vitest";
import { buildMitigationPlansSchema } from "./schema";

const ids = {
  vulnerabilityIds: ["vuln_1", "vuln_2"],
  remediationIds: ["rem_1"],
  deviceGroupMatchingIds: ["dgm_1", "dgm_2"],
};

const schema = buildMitigationPlansSchema(ids);

const goldenPlan = {
  title: "Contain now, patch on schedule",
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
      vulnerabilityIds: ["vuln_1"],
      remediationIds: [],
      deviceGroups: [
        {
          id: "dgm_1",
          confidence: "Matched",
          reasonWhy: "These are the scanners exposed on the imaging VLAN.",
        },
      ],
    },
  ],
};

const withWorkOrder = (workOrder: Record<string, unknown>) => ({
  plans: [{ ...goldenPlan, workOrders: [workOrder] }],
});

describe("buildMitigationPlansSchema", () => {
  it("accepts a well-formed, ordered plan list", () => {
    const parsed = schema.safeParse({ plans: [goldenPlan] });
    expect(parsed.success).toBe(true);
  });

  it("accepts an empty plan list (agent declined to propose any)", () => {
    const parsed = schema.safeParse({ plans: [] });
    expect(parsed.success).toBe(true);
  });

  it("accepts a work order that links nothing", () => {
    const parsed = schema.safeParse(
      withWorkOrder({
        ...goldenPlan.workOrders[0],
        vulnerabilityIds: [],
        remediationIds: [],
        deviceGroups: [],
      }),
    );
    expect(parsed.success).toBe(true);
  });

  it("rejects an unknown tag", () => {
    const parsed = schema.safeParse({
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
    const parsed = schema.safeParse({
      plans: [{ ...goldenPlan, cards: partialCards }],
    });
    expect(parsed.success).toBe(false);
  });

  it("rejects a vulnerability id outside the catalog", () => {
    const parsed = schema.safeParse(
      withWorkOrder({
        ...goldenPlan.workOrders[0],
        vulnerabilityIds: ["vuln_hallucinated"],
      }),
    );
    expect(parsed.success).toBe(false);
  });

  it("rejects a device group id outside the catalog", () => {
    const parsed = schema.safeParse(
      withWorkOrder({
        ...goldenPlan.workOrders[0],
        deviceGroups: [
          { id: "dgm_nope", confidence: "Matched", reasonWhy: "invented" },
        ],
      }),
    );
    expect(parsed.success).toBe(false);
  });

  it("allows no ids at all when the context resolved none", () => {
    const emptySchema = buildMitigationPlansSchema({
      vulnerabilityIds: [],
      remediationIds: [],
      deviceGroupMatchingIds: [],
    });
    const workOrder = {
      shortDescription: "Ask the vendor for an advisory",
      detailedDescription: "No hospital entities resolved yet.",
      vulnerabilityIds: [],
      remediationIds: [],
      deviceGroups: [],
    };
    expect(
      emptySchema.safeParse({
        plans: [{ ...goldenPlan, workOrders: [workOrder] }],
      }).success,
    ).toBe(true);
    expect(
      emptySchema.safeParse({
        plans: [
          {
            ...goldenPlan,
            workOrders: [{ ...workOrder, vulnerabilityIds: ["vuln_1"] }],
          },
        ],
      }).success,
    ).toBe(false);
  });
});
