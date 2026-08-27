import "server-only";
import { ChatAnthropic } from "@langchain/anthropic";
import { planCardsSchema } from "@/features/inbox/agent/mitigation/schema";
import {
  type Briefing,
  generatedBriefingSchema,
  renderBriefing,
} from "./schema";

const MODEL = "claude-haiku-4-5-20251001";

const SYSTEM_PROMPT = `You are a briefing-writing agent for a hospital cybersecurity platform. Given a proposed mitigation plan, write the case for why it makes sense — for three audiences reading the same plan: a CISO, a CMIO, and a department head (e.g. biomed engineering).

Each audience needs SUBSTANTIVELY different content, not the same facts reworded.

AUDIENCE & VOICE:
- CISO: attack surface, exploitability, compliance/regulatory exposure (e.g. HIPAA).
- CMIO: patient safety impact, clinical workflow disruption, downtime tolerance for affected devices.
- Dept head: concrete tasks their team owns, timeline, effort/staffing implied by the work orders.
- Do not write the same sentence three times with a different label. If you find yourself describing the same fact for two audiences, cut it down to what's actually relevant to each one specifically.

RULES:
- If this plan is not the recommended one, "whyThisPlan" must give the legitimate, specific reason someone in that role might still choose it over the recommended plan — never just concede that the recommended plan is better.
- Ground everything in the plan details given below; never invent facts.`;

export type BriefingPlanInput = {
  title: string;
  summary: string;
  compareLine: string | null;
  cards: unknown;
  isRecommended: boolean;
  // The recommended plan's own title/summary, for a non-recommended plan to
  // argue against by name. Null when this plan IS the recommended one.
  recommendedPlan: { title: string; summary: string } | null;
  workOrders: { summary: string; body: string | null }[];
};

function renderPlanPrompt(plan: BriefingPlanInput): string {
  const cardsParse = planCardsSchema.safeParse(plan.cards);
  const cards = cardsParse.success ? cardsParse.data : null;

  const sections = [
    `## Plan${plan.isRecommended ? " (recommended)" : " (alternative — not the recommended plan)"}\n\n### ${plan.title}\n\n${plan.summary}`,
  ];

  if (plan.compareLine) {
    sections.push(
      `## How it compares to the other plans\n\n${plan.compareLine}`,
    );
  }

  if (plan.recommendedPlan) {
    sections.push(
      `## The recommended plan (for comparison)\n\n### ${plan.recommendedPlan.title}\n\n${plan.recommendedPlan.summary}`,
    );
  }

  if (cards) {
    sections.push(
      "## Plan metrics\n\n" +
        Object.entries(cards)
          .map(([key, value]) => `- ${key}: ${value}`)
          .join("\n"),
    );
  }

  if (plan.workOrders.length > 0) {
    sections.push(
      "## Work orders this plan creates\n\n" +
        plan.workOrders
          .map((w) => `- ${w.summary}${w.body ? `: ${w.body}` : ""}`)
          .join("\n"),
    );
  }

  return sections.join("\n\n");
}

export async function generateBriefing(
  plan: BriefingPlanInput,
): Promise<Briefing> {
  const model = new ChatAnthropic({
    model: MODEL,
    maxTokens: 2000,
  }).withStructuredOutput(generatedBriefingSchema);

  const generated = await model.invoke([
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: renderPlanPrompt(plan) },
  ]);

  return renderBriefing(generated);
}
