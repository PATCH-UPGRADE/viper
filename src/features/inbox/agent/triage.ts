import "server-only";
import { ChatAnthropic } from "@langchain/anthropic";
import { z } from "zod";
import { buildUserMessage } from "@/lib/agent-messages";
import prisma from "@/lib/db";
import { hospitalImpactSchema } from "../types";
import { fetchPdfAttachments } from "../utils";
import { gatherTriageContext } from "./triage-context";

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

PRIORITY TIERS:
- Critical: Immediate patient safety risk or active exploitation in the wild. Requires same-day action.
- High: Significant vulnerability or recall with real exploitation potential. Requires patching or mitigation within days.
- Monitor: Notable issue but low immediate risk; no active exploitation known. Track and plan remediation in the next maintenance cycle.
- Defer: Informational or low-severity. No current risk; review at a scheduled interval.

HOSPITAL IMPACT — return a JSON object with exactly these fields:
- byline: One bold headline sentence naming what could happen and to which devices/areas. Concrete and specific (e.g. "Alarm tampering on 8 ICU patient monitors could delay response to life-threatening events").
- impactStatement: 2-4 sentences describing the clinical and operational impact in plain terms — what systems/workflows are affected, the patient-safety risk, and the operational disruption of remediating.
- careAreas: A short string naming the affected clinical areas and device types. You MUST phrase this ONLY from the "Care areas" section of the provided context (its locations, roles, and device types). If no care areas are provided, return an empty string. Do NOT invent department or ward names.
- likelihood: A short free-text descriptor of exploitation likelihood, grounded in the actual evidence — CVSS score/vector, EPSS, CISA KEV status, exploit availability, and the VEX determinations in the context (e.g. "Unauthenticated network RCE · PoC exploit code exists"). Never invent numbers.

RULES:
- You MUST pick exactly one priority tier — never leave it ambiguous.
- Base every field on the notification content and the provided hospital context. Never invent device counts, CVSS/EPSS numbers, care areas, or exploitation facts — use only what the context states.
- Factor VEX determinations into impact and priority: assets marked NOT_AFFECTED reduce the real exposure; AFFECTED / UNDER_INVESTIGATION raise it.
- If known device groups support clinical functions (life support, medication delivery, diagnostics), that elevates priority.
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
    fetchPdfAttachments(sourceId),
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
