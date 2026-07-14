// Assigns priority, priorityReasonWhy, and hospitalImpact to a Notification

// TODO: This is where we want our CDST to run here
// Currently this is just haiku + prompt, we want something more sophisiticated
// to be coming up with these values

import "server-only";
import { ChatAnthropic } from "@langchain/anthropic";
import { z } from "zod";
import { buildUserMessage } from "@/lib/agent-messages";
import prisma from "@/lib/db";
import { fetchPdfAttachments } from "../utils";

const MODEL = "claude-haiku-4-5-20251001";

// Flat schema required: Anthropic's tool input_schema must have a top-level "type": "object"
const triageSchema = z.object({
  priority: z.enum(["Critical", "High", "Monitor", "Defer"]),
  priorityReasonWhy: z
    .string()
    .describe("1-2 sentences explaining why this priority was assigned"),
  hospitalImpact: z
    .string()
    .describe(
      "3-5 sentence paragraph describing the clinical and operational impact to the hospital, in simple terms",
    ),
});

export type TriageResult = z.infer<typeof triageSchema>;

const SYSTEM_PROMPT = `You are a triage agent for a hospital cybersecurity platform. Given a security notification and its context, your job is to assign a priority tier, explain why, and describe the clinical and operational impact on the hospital.

PRIORITY TIERS:
- Critical: Immediate patient safety risk or active exploitation in the wild. Requires same-day action.
- High: Significant vulnerability or recall with real exploitation potential. Requires patching or mitigation within days.
- Monitor: Notable issue but low immediate risk; no active exploitation known. Track and plan remediation in the next maintenance cycle.
- Defer: Informational or low-severity. No current risk; review at a scheduled interval.

RULES:
- You MUST pick exactly one tier — never leave priority ambiguous.
- Base your decision on the notification type (Advisory/Recall/UpdateAvailable/Other), the affected device groups, and any CVSS scores, active exploitation indicators, or patient-safety language in the content.
- If known device groups are listed, factor in whether they support clinical functions (life support, medication delivery, diagnostics) — those elevate priority.
- priorityReasonWhy: 1-2 sentences. Cite the most important factor (e.g. CVSS score, active exploitation, device type).
- hospitalImpact: 3-5 sentences. Describe which hospital systems or clinical workflows are affected, what patient-safety risk exists, and what operational disruption remediation would cause.`;

function buildTextPrompt(input: {
  notificationType: string;
  notificationTitle: string | null;
  notificationSummary: string | null;
  markdown: string | null;
}): string {
  return `--- NOTIFICATION ---
Type: ${input.notificationType}
Title: ${input.notificationTitle ?? "(untitled)"}
Summary: ${input.notificationSummary ?? "(none)"}

--- FULL NOTIFICATION BODY ---
${input.markdown ?? "(no body)"}`;
}

export async function triageNotification(
  sourceId: string,
  notificationId: string,
): Promise<TriageResult> {
  const [source, notification, pdfAttachments] = await Promise.all([
    prisma.notificationSource.findUnique({
      where: { id: sourceId },
      select: { markdown: true },
    }),
    prisma.notification.findUnique({
      where: { id: notificationId },
      select: { type: true, title: true, summary: true },
    }),
    fetchPdfAttachments(sourceId),
  ]);

  const model = new ChatAnthropic({
    model: MODEL,
    maxTokens: 1024,
  }).withStructuredOutput(triageSchema);

  const textPrompt = buildTextPrompt({
    notificationType: notification?.type ?? "Other",
    notificationTitle: notification?.title ?? null,
    notificationSummary: notification?.summary ?? null,
    markdown: source?.markdown ?? null,
  });

  return model.invoke([
    { role: "system", content: SYSTEM_PROMPT },
    buildUserMessage(textPrompt, pdfAttachments),
  ]);
}
