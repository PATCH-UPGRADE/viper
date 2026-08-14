import { z } from "zod";
import type { EntityRefs } from "@/features/inbox/agent/refs";
import { PlanTagEnum } from "@/generated/prisma";

// Stored in MitigationPlan.card
// TODO: Consider making these strings optional if not enough info
export const planCardsSchema = z.object({
  effort: z.string().describe("e.g. '2 tickets · ~14 hrs total'"),
  downtime: z.string().describe("expected downtime, e.g. 'None to contain'"),
  residual_risk: z
    .string()
    .describe("risk remaining after this plan, e.g. 'Low'"),
  coverage: z
    .string()
    .describe("how much exposure this closes, e.g. '6 of 6 assets'"),
  timeline: z.string().describe("when it lands, e.g. 'Contained today'"),
  rollback: z
    .string()
    .optional()
    .describe(
      "how easily this plan can be undone once applied, e.g. 'Easy — the VLAN move reverts from the switch config in ~15 min.' One or two sentences: what has to be reverted, roughly how long, and whether the manufacturer has to be involved",
    ),
});

/**
 * Only allow the model to select an id in `ids`, otherwise never allow an entry
 */
function idArray(ids: string[], description: string) {
  const inner =
    ids.length > 0 ? z.enum(ids as [string, ...string[]]) : z.never();
  return z.array(inner).describe(description);
}

/**
 * Bake the valid refs into the schema we give the model itself. The model never
 * sees database ids — `createMitigationPlans` translates refs back after parsing.
 */
export function buildMitigationPlansSchema(refs: EntityRefs) {
  const planWorkOrderSchema = z.object({
    shortDescription: z
      .string()
      .describe("concise, action-oriented work-order title"),
    detailedDescription: z
      .string()
      .describe("full description of the work to perform"),
    vulnerabilityIds: idArray(
      refs.vulnerabilityRefs,
      "refs (e.g. vuln-1) of ONLY the vulnerabilities this specific work order addresses; empty if none",
    ),
    remediationIds: idArray(
      refs.remediationRefs,
      "refs (e.g. rem-1) of ONLY the remediations this specific work order applies; empty if none",
    ),
    deviceGroups: z
      .array(
        z.object({
          id:
            refs.deviceGroupMatchingRefs.length > 0
              ? z.enum(refs.deviceGroupMatchingRefs as [string, ...string[]])
              : z.never(),
          confidence: z
            .enum(["NeedsReview", "Matched"])
            .describe(
              "Matched = strong evidence this work order targets this device group; NeedsReview = plausible but a human should verify.",
            ),
          reasonWhy: z
            .string()
            .describe("one line on why this work order targets this group"),
        }),
      )
      .describe(
        "ONLY the device groups this specific work order touches; empty if none",
      ),
  });

  const offered = Object.keys(refs.idByRef); // ["vuln-1","rem-1","group-1","group-2","asset-1"]
  // Finds those exact refs as whole words: "group-1" hits, "VLAN group-10" doesn't.
  const leakPattern =
    offered.length > 0 ? new RegExp(`\\b(?:${offered.join("|")})\\b`) : null;

  const mitigationPlanItemSchema = z
    .object({
      title: z.string(),
      summary: z.string().describe("what this plan does, in plain terms"),
      compareLine: z
        .string()
        .describe("short blurb comparing this plan to the other plans"),
      tags: z.array(z.enum(PlanTagEnum)),
      cards: planCardsSchema,
      workOrders: z
        .array(planWorkOrderSchema)
        .describe(
          "the work orders that would be created if this plan is accepted",
        ),
    })
    // Reject rather than strip the ref: a silent scrub would ship the plan that leaked.
    .superRefine((plan, ctx) => {
      if (!leakPattern) return;
      const check = (text: string, path: (string | number)[]) => {
        const hit = text.match(leakPattern);
        if (hit) {
          ctx.addIssue({
            code: "custom",
            path,
            message: `internal reference "${hit[0]}" must not appear in staff-visible text`,
          });
        }
      };
      check(plan.title, ["title"]);
      check(plan.summary, ["summary"]);
      check(plan.compareLine, ["compareLine"]);
      for (const [key, value] of Object.entries(plan.cards)) {
        check(value, ["cards", key]);
      }
      plan.workOrders.forEach((w, i) => {
        check(w.shortDescription, ["workOrders", i, "shortDescription"]);
        check(w.detailedDescription, ["workOrders", i, "detailedDescription"]);
        w.deviceGroups.forEach((g, j) => {
          check(g.reasonWhy, ["workOrders", i, "deviceGroups", j, "reasonWhy"]);
        });
      });
    });

  return z.object({
    plans: z
      .array(mitigationPlanItemSchema)
      .describe(
        "ordered mitigation plans, best/recommended first; empty if there isn't enough information to propose any",
      ),
  });
}

export type PlanCards = z.infer<typeof planCardsSchema>;

export type PlanWorkOrder = {
  shortDescription: string;
  detailedDescription: string;
  vulnerabilityIds: string[];
  remediationIds: string[];
  deviceGroups: Array<{
    id: string;
    confidence: "NeedsReview" | "Matched";
    reasonWhy: string;
  }>;
};

export type MitigationPlanItem = {
  title: string;
  summary: string;
  compareLine: string;
  tags: PlanTagEnum[];
  cards: PlanCards;
  workOrders: PlanWorkOrder[];
};

export type MitigationPlansResult = { plans: MitigationPlanItem[] };
