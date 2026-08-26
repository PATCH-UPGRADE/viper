import "server-only";
import { z } from "zod";

// GENERATION schema — what the model is forced to produce via
// withStructuredOutput. Never persisted directly.
const briefingSectionSchema = z.object({
  exposure: z
    .string()
    .describe("What's at risk, tailored to what this audience cares about."),
  whyThisPlan: z
    .string()
    .describe(
      "Why this plan over the alternatives, for this audience. If this isn't the recommended plan, give the legitimate reason someone might still choose it — don't just concede to the recommended plan.",
    ),
  whyNow: z.string().describe("Urgency, for this audience."),
});

export const generatedBriefingSchema = z.object({
  ciso: briefingSectionSchema,
  cmio: briefingSectionSchema,
  deptHead: briefingSectionSchema,
});

export type GeneratedBriefing = z.infer<typeof generatedBriefingSchema>;

// PERSISTED / rendered schema — one markdown string per audience. This is
// what's stored in `PlanBriefing.content`, returned by `getBriefing`, and
// what the drawer renders.
export const briefingSchema = z.object({
  ciso: z.string(),
  cmio: z.string(),
  deptHead: z.string(),
});

export type Briefing = z.infer<typeof briefingSchema>;

// Flattens one audience's structured sections into the markdown shown in
// the mock (bold section headers, blank line between sections).
function renderSection(section: z.infer<typeof briefingSectionSchema>): string {
  return [
    `**Security exposure**\n${section.exposure}`,
    `**Why this plan, not the alternatives**\n${section.whyThisPlan}`,
    `**Why now**\n${section.whyNow}`,
  ].join("\n\n");
}

export function renderBriefing(generated: GeneratedBriefing): Briefing {
  return Object.fromEntries(
    Object.entries(generated).map(([audience, section]) => [
      audience,
      renderSection(section),
    ]),
  ) as Briefing;
}
