// Assigns priority, priorityReasonWhy, and hospitalImpact to a Notification

import "server-only";
import { ChatAnthropic } from "@langchain/anthropic";
import { HumanMessage } from "@langchain/core/messages";
import { z } from "zod";
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
      "3-5 sentence paragraph describing the clinical and operational impact to the hospital",
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
  deviceGroups: Array<{
    vendor: string | null;
    product: string | null;
    version: string | null;
    cpe: string[];
  }>;
}): string {
  const deviceGroupsText =
    input.deviceGroups.length > 0
      ? input.deviceGroups
          .map((dg) => {
            const parts = [
              dg.vendor && `Vendor: ${dg.vendor}`,
              dg.product && `Product: ${dg.product}`,
              dg.version && `Version: ${dg.version}`,
              dg.cpe.length > 0 && `CPE: ${dg.cpe.join(", ")}`,
            ].filter(Boolean);
            return `- ${parts.join(" | ")}`;
          })
          .join("\n")
      : "(none matched in this hospital's inventory)";

  return `--- NOTIFICATION ---
Type: ${input.notificationType}
Title: ${input.notificationTitle ?? "(untitled)"}
Summary: ${input.notificationSummary ?? "(none)"}

--- AFFECTED DEVICE GROUPS ---
${deviceGroupsText}

--- FULL NOTIFICATION BODY ---
${input.markdown ?? "(no body)"}`;
}

export async function triageNotification(
  sourceId: string,
  notificationId: string,
): Promise<TriageResult> {
  const [source, notification, deviceGroupMappings, pdfAttachments] =
    await Promise.all([
      prisma.notificationSource.findUnique({
        where: { id: sourceId },
        select: { markdown: true },
      }),
      prisma.notification.findUnique({
        where: { id: notificationId },
        select: { type: true, title: true, summary: true },
      }),
      prisma.notificationDeviceGroupMapping.findMany({
        where: { notificationId },
        include: {
          deviceGroup: {
            include: { vendor: true, product: true, version: true },
          },
        },
      }),
      fetchPdfAttachments(sourceId),
    ]);

  const deviceGroups = deviceGroupMappings.map((m) => ({
    vendor: m.deviceGroup.vendor?.canonicalDisplayName ?? null,
    product: m.deviceGroup.product?.canonicalDisplayName ?? null,
    version: m.deviceGroup.version?.canonicalDisplayName ?? null,
    cpe: m.deviceGroup.cpe,
  }));

  const model = new ChatAnthropic({
    model: MODEL,
    maxTokens: 1024,
  }).withStructuredOutput(triageSchema);

  const textPrompt = buildTextPrompt({
    notificationType: notification?.type ?? "Other",
    notificationTitle: notification?.title ?? null,
    notificationSummary: notification?.summary ?? null,
    markdown: source?.markdown ?? null,
    deviceGroups,
  });

  const userContent = [
    { type: "text" as const, text: textPrompt },
    ...pdfAttachments.map((pdf) => ({
      type: "document",
      source: {
        type: "base64",
        media_type: "application/pdf",
        data: pdf.base64,
      },
      title: pdf.filename ?? "attachment.pdf",
    })),
  ];

  return model.invoke([
    { role: "system", content: SYSTEM_PROMPT },
    // biome-ignore lint/suspicious/noExplicitAny: cast userContent type for langchain
    new HumanMessage({ content: userContent as any }),
  ]);
}
