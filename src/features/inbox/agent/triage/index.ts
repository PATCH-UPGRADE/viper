import "server-only";
import { ChatAnthropic } from "@langchain/anthropic";
import { z } from "zod";
import { buildUserMessage, type PdfAttachment } from "@/lib/agent-messages";
import prisma from "@/lib/db";
import { hospitalImpactSchema } from "../../types";
import { fetchPdfAttachments } from "../../utils";
import { gatherTriageContext } from "./context";

const MODEL = "claude-haiku-4-5-20251001";

const triageSchema = z.object({
  priority: z.enum(["Critical", "High", "Monitor", "Defer"]),
  priorityReasonWhy: z
    .string()
    .describe("1-2 sentences explaining why this priority was assigned"),
  hospitalImpact: hospitalImpactSchema,
});

export type TriageResult = z.infer<typeof triageSchema>;

const SYSTEM_PROMPT = `You are a triage agent for a hospital cybersecurity platform. Given a security notification and the resolved hospital context, assign a priority tier, explain why, and describe the clinical and operational impact on the hospital.

PRIORITY — decide the tier with this procedure, in order. It runs on the evidence alone: how you word the text fields must never change its outcome.

Step 1 — Baseline from exploitation evidence:
- On CISA KEV and CVSS >= 7.0 -> Critical
- On CISA KEV and CVSS < 7.0 -> Monitor
- Not on KEV, EPSS >= 0.088 (8.8%), CVSS >= 7.0 -> High
- Not on KEV, EPSS >= 0.088 (8.8%), CVSS < 7.0 -> Monitor
- Not on KEV, EPSS < 0.088 (8.8%) -> Defer
- If EPSS or CVSS is absent, pick the closest row from the strongest evidence the context does state (public exploit code, reports of active exploitation, vendor severity rating).

Step 2 — Clinical elevation, at most one tier up. Raise one tier if EITHER holds for assets that are still exposed: (a) the devices perform a life-safety or direct patient-care function — life support, medication delivery, or diagnostics clinicians act on, which includes imaging review, PACS, and laboratory systems; or (b) the context states that working exploit code is publicly available.

Step 3 — Exposure reduction, at most one tier down. Lower one tier only if every affected asset is confirmed unaffected or already remediated.

Step 4 — The tier that results is your answer. State it exactly. Never adjust it for tone, audience, or how the impact reads.

TIER MEANINGS (labels for the result above):
- Critical: Immediate patient safety risk or active exploitation in the wild. Requires same-day action.
- High: Significant vulnerability or recall with real exploitation potential. Requires patching or mitigation within days.
- Monitor: Notable issue but low immediate risk; no active exploitation known. Track and plan remediation in the next maintenance cycle.
- Defer: Informational or low-severity. No current risk; review at a scheduled interval.

HOSPITAL IMPACT — return a JSON object with exactly these fields:
These four fields are read by hospital staff (administrators, clinicians, biomedical engineers), not by security engineers. Write them in plain words: no internal vocabulary ("VEX", NOT_AFFECTED, UNDER_INVESTIGATION), no database ids, and no bare score lists. Say "confirmed unaffected" / "still being verified" instead of status codes. This governs wording only — it does not change the tier you assigned above.
- byline: One bold headline sentence naming what could happen and to which devices/areas. Concrete and specific (e.g. "Alarm tampering on 8 ICU patient monitors could delay response to life-threatening events").
- impactStatement: 2-4 sentences describing the clinical and operational impact in plain terms — what systems/workflows are affected, the patient-safety risk, and the operational disruption of remediating.
- careAreas: A short string naming the affected clinical areas and device types. You MUST phrase this ONLY from the "Care areas" section of the provided context (its locations, roles, and device types). If no care areas are provided, return an empty string. Do NOT invent department or ward names.
- likelihood: How likely exploitation is at this hospital — a plain-words judgment first, the reason in everyday terms after it, grounded in the evidence in the context (CVSS score/vector, EPSS, CISA KEV status, exploit availability, VEX determinations). Write whatever judgment the evidence supports. Good (severe): "Very likely to be exploited — attackers are already using this flaw, and it can be triggered from anywhere on the network without a password." Good (mild): "Unlikely to be exploited — an attacker would need network access first, and no attacks using this flaw have been reported anywhere." Bad: "Unauthenticated network RCE · PoC exploit code exists · EPSS 42% · On CISA KEV". Never invent numbers; never lead with raw scores.

RULES:
- You MUST pick exactly one priority tier — never leave it ambiguous.
- Base every field on the notification content and the provided hospital context. Never invent device counts, CVSS/EPSS numbers, care areas, or exploitation facts — use only what the context states.
- Factor VEX determinations into the impact you describe: assets confirmed unaffected reduce the real exposure, assets still affected or under investigation carry it. Their effect on the tier is already covered by Steps 2 and 3 — do not apply it twice.
- priorityReasonWhy: 1-2 sentences. Cite the most important factor (e.g. CVSS score, active exploitation, device type, VEX result).`;

function buildTextPrompt(input: {
  notificationType: string;
  notificationTitle: string | null;
  notificationSummary: string | null;
  markdown: string | null;
  contextMarkdown: string;
}): string {
  return `--- NOTIFICATION ---
Type: ${input.notificationType}
Title: ${input.notificationTitle ?? "(untitled)"}
Summary: ${input.notificationSummary ?? "(none)"}

--- FULL NOTIFICATION BODY ---
${input.markdown ?? "(no body)"}

--- RESOLVED HOSPITAL CONTEXT ---
${input.contextMarkdown}`;
}

export async function triageNotification(
  sourceId: string,
  notificationId: string,
  inlinedPdfs?: PdfAttachment[],
): Promise<TriageResult> {
  const [source, notification, pdfAttachments, context] = await Promise.all([
    prisma.notificationSource.findUnique({
      where: { id: sourceId },
      select: { markdown: true },
    }),
    prisma.notification.findUnique({
      where: { id: notificationId },
      select: { type: true, title: true, summary: true },
    }),
    inlinedPdfs ?? fetchPdfAttachments(sourceId),
    gatherTriageContext(notificationId),
  ]);

  const model = new ChatAnthropic({
    model: MODEL,
    maxTokens: 2048,
  }).withStructuredOutput(triageSchema);

  const textPrompt = buildTextPrompt({
    notificationType: notification?.type ?? "Other",
    notificationTitle: notification?.title ?? null,
    notificationSummary: notification?.summary ?? null,
    markdown: source?.markdown ?? null,
    contextMarkdown: context.markdown,
  });

  return model.invoke([
    { role: "system", content: SYSTEM_PROMPT },
    buildUserMessage(textPrompt, pdfAttachments),
  ]);
}
