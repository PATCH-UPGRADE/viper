// @vitest-environment node
import { describe, expect, it } from "vitest";
import { buildEntityRefs } from "../refs";
import { buildMitigationPlansSchema } from "./schema";

const refs = buildEntityRefs({
  vulnerabilityIds: ["cmvuln0000000000000000001", "cmvuln0000000000000000002"],
  remediationIds: ["cmrem00000000000000000001"],
  deviceGroupMatchingIds: [
    "cmdgm00000000000000000001",
    "cmdgm00000000000000000002",
  ],
});

const schema = buildMitigationPlansSchema(refs);

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
    rollback_level: "Easy",
    rollback_summary: "Revertible by IT in minutes",
    rollback:
      "The firewall rules revert from the console in ~10 min. The firmware update needs a vendor session to roll back.",
  },
  workOrders: [
    {
      shortDescription: "Block TCP 32912/32914 at the imaging VLAN boundary",
      detailedDescription:
        "Add deny rules for TCP 32912 and 32914 inbound to the imaging VLAN.",
      vulnerabilityIds: ["vuln-1"],
      remediationIds: [],
      deviceGroups: [
        {
          id: "group-1",
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

  it("accepts a plan with no rollback card — rows written before the field existed", () => {
    const {
      rollback: _rollback,
      rollback_level: _level,
      rollback_summary: _summary,
      ...cardsWithoutRollback
    } = goldenPlan.cards;
    const parsed = schema.safeParse({
      plans: [{ ...goldenPlan, cards: cardsWithoutRollback }],
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects a rollback level outside the enum", () => {
    const parsed = schema.safeParse({
      plans: [
        {
          ...goldenPlan,
          cards: { ...goldenPlan.cards, rollback_level: "Trivial" },
        },
      ],
    });
    expect(parsed.success).toBe(false);
  });

  it("rejects an opaque ref leaking into the rollback card", () => {
    const parsed = schema.safeParse({
      plans: [
        {
          ...goldenPlan,
          cards: {
            ...goldenPlan.cards,
            rollback: "Revert the group-1 switch config.",
          },
        },
      ],
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

  it("rejects a raw database id — the model only ever sees refs", () => {
    const parsed = schema.safeParse(
      withWorkOrder({
        ...goldenPlan.workOrders[0],
        vulnerabilityIds: ["cmvuln0000000000000000001"],
      }),
    );
    expect(parsed.success).toBe(false);
  });

  it("rejects an opaque ref leaking into work-order prose, even with valid links", () => {
    const parsed = schema.safeParse(
      withWorkOrder({
        ...goldenPlan.workOrders[0],
        detailedDescription:
          "Patch the workstations in group-1 during the next maintenance window.",
      }),
    );
    expect(parsed.success).toBe(false);
  });

  it("rejects an opaque ref leaking into a plan card", () => {
    const parsed = schema.safeParse({
      plans: [
        {
          ...goldenPlan,
          cards: { ...goldenPlan.cards, coverage: "all assets in group-2" },
        },
      ],
    });
    expect(parsed.success).toBe(false);
  });

  it("does not flag prose that merely resembles a ref", () => {
    const parsed = schema.safeParse(
      withWorkOrder({
        ...goldenPlan.workOrders[0],
        detailedDescription:
          "Move the scanners to VLAN group-10 and verify subgroup-1 connectivity.",
      }),
    );
    expect(parsed.success).toBe(true);
  });

  it("rejects a device group id outside the catalog", () => {
    const parsed = schema.safeParse(
      withWorkOrder({
        ...goldenPlan.workOrders[0],
        deviceGroups: [
          { id: "group_nope", confidence: "Matched", reasonWhy: "invented" },
        ],
      }),
    );
    expect(parsed.success).toBe(false);
  });

  it("allows no ids at all when the context resolved none", () => {
    const emptySchema = buildMitigationPlansSchema(
      buildEntityRefs({
        vulnerabilityIds: [],
        remediationIds: [],
        deviceGroupMatchingIds: [],
      }),
    );
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
            workOrders: [{ ...workOrder, vulnerabilityIds: ["vuln-1"] }],
          },
        ],
      }).success,
    ).toBe(false);
  });
});
