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

AUDIENCE & VOICE — every text field you write is shown directly to hospital staff (administrators, clinicians, biomedical engineers), NOT to security engineers:
- Lead with what could happen and to whom, in plain words. Technical evidence (CVSS, EPSS, CISA KEV, exploit availability) may appear only as brief supporting explanation after the plain statement — never as the headline, never as an unexplained score.
- Never use internal or standards vocabulary in your text: no "VEX", no issue statuses like "NOT_AFFECTED" or "UNDER_INVESTIGATION", no database ids. Translate them: "confirmed unaffected", "still being verified".
- Name devices the way hospital staff know them — vendor, product, and where they sit (e.g. "the syngo.plaza review workstations in Radiology") — never by internal identifiers.

PRIORITY TIERS:
- Critical: Immediate patient safety risk or active exploitation in the wild. Requires same-day action.
- High: Significant vulnerability or recall with real exploitation potential. Requires patching or mitigation within days.
- Monitor: Notable issue but low immediate risk; no active exploitation known. Track and plan remediation in the next maintenance cycle.
- Defer: Informational or low-severity. No current risk; review at a scheduled interval.

HOSPITAL IMPACT — return a JSON object with exactly these fields:
- byline: One bold headline sentence naming what could happen and to which devices/areas. Concrete and specific (e.g. "Alarm tampering on 8 ICU patient monitors could delay response to life-threatening events").
- impactStatement: 2-4 sentences describing the clinical and operational impact in plain terms — what systems/workflows are affected, the patient-safety risk, and the operational disruption of remediating.
- careAreas: A short string naming the affected clinical areas and device types. You MUST phrase this ONLY from the "Care areas" section of the provided context (its locations, roles, and device types). If no care areas are provided, return an empty string. Do NOT invent department or ward names.
- likelihood: How likely this is to actually be exploited at this hospital, stated as a plain-words judgment first, with the reason in everyday terms after it — grounded in the actual evidence in the context (CVSS score/vector, EPSS, CISA KEV status, exploit availability, and the VEX determinations). Good: "Unlikely to be exploited — an attacker would first need access to the hospital network, and no attacks using this flaw have been reported anywhere." Bad: "Network-accessible credential extraction · No public exploit · EPSS 0.27% · Not on CISA KEV". Never invent numbers; never lead with raw scores.

RULES:
- You MUST pick exactly one priority tier — never leave it ambiguous.
- Base every field on the notification content and the provided hospital context. Never invent device counts, CVSS/EPSS numbers, care areas, or exploitation facts — use only what the context states.
- Factor VEX determinations into impact and priority: assets marked NOT_AFFECTED reduce the real exposure; AFFECTED / UNDER_INVESTIGATION raise it. In your writing, express these as "confirmed unaffected" / "still being verified" — never the raw status words.
- If known device groups support clinical functions (life support, medication delivery, diagnostics), that elevates priority.
- priorityReasonWhy: 1-2 sentences in the same plain voice. Cite the most important factor as a reason an administrator would understand (e.g. "attackers are actively using this flaw in the wild", not "present on CISA KEV").`;

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
