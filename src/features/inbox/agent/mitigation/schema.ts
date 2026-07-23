import { z } from "zod";
import type { LinkableIds } from "@/features/inbox/agent/triage/context";
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
 * Bake valid ID's into the schema we give the model itself...
 */
export function buildMitigationPlansSchema(ids: LinkableIds) {
  const planWorkOrderSchema = z.object({
    shortDescription: z
      .string()
      .describe("concise, action-oriented work-order title"),
    detailedDescription: z
      .string()
      .describe("full description of the work to perform"),
    vulnerabilityIds: idArray(
      ids.vulnerabilityIds,
      "ids of ONLY the vulnerabilities this specific work order addresses; empty if none",
    ),
    remediationIds: idArray(
      ids.remediationIds,
      "ids of ONLY the remediations this specific work order applies; empty if none",
    ),
    deviceGroups: z
      .array(
        z.object({
          id:
            ids.deviceGroupMatchingIds.length > 0
              ? z.enum(ids.deviceGroupMatchingIds as [string, ...string[]])
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

  const mitigationPlanItemSchema = z.object({
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
