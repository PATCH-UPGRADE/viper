import { z } from "zod";
import { PlanTagEnum } from "@/generated/prisma";

// At-a-glance metrics rendered as the plan's cards. Stored verbatim as JSON on
// MitigationPlan.cards.
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

export const planWorkOrderSchema = z.object({
  shortDescription: z.string().describe("concise, action-oriented work-order title"),
  detailedDescription: z
    .string()
    .describe("full description of the work to perform"),
  // TODO: (HEY!) need a way to link device groups, assets, remediations, and vulnerabilities here
});

export const mitigationPlanItemSchema = z.object({
  title: z.string(),
  summary: z.string().describe("what this plan does, in plain terms"),
  compareLine: z
    .string()
    .describe("short blurb comparing this plan to the other plans"),
  tags: z.array(z.enum(PlanTagEnum)),
  cards: planCardsSchema,
  workOrders: z
    .array(planWorkOrderSchema)
    .describe("the work orders that would be created if this plan is accepted"),
});

export const mitigationPlansSchema = z.object({
  plans: z
    .array(mitigationPlanItemSchema)
    .describe(
      "ordered mitigation plans, best/recommended first; empty if there isn't enough information to propose any",
    ),
});

export type MitigationPlanItem = z.infer<typeof mitigationPlanItemSchema>;
export type MitigationPlansResult = z.infer<typeof mitigationPlansSchema>;
