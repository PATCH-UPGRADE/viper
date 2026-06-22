import "server-only";
import { ChatAnthropic } from "@langchain/anthropic";
import { HumanMessage } from "@langchain/core/messages";
import { z } from "zod";
import prisma from "@/lib/db";
import { notificationPayloadSchema } from "../types";
import { fetchPdfAttachments } from "../utils";

const MODEL = "claude-haiku-4-5-20251001";

// Flat schema required: Anthropic's tool input_schema must have a top-level "type": "object",
// which z.discriminatedUnion / z.union produce as "oneOf" and fail validation.
const classifySchema = notificationPayloadSchema.extend({
  action: z.enum(["create", "update"]),
  notificationId: z
    .string()
    .optional()
    .describe(
      "Required when action is 'update': id of the existing notification to link to",
    ),
  reasonWhy: z
    .string()
    .optional()
    .describe(
      "Required when action is 'update': why this email was matched to the existing notification",
    ),
});

type ClassifyResult = z.infer<typeof classifySchema>;

const SYSTEM_PROMPT = `You are a classification agent for a hospital cybersecurity platform that processes security-related emails.

Your tasks:
1. Classify the email into one of: Advisory, Recall, UpdateAvailable, Other
2. Extract a concise, informative title (prefer vendor/CVE/device names over generic phrases)
3. Write a 1–3 sentence summary suitable for a hospital security officer
4. Assign a TLP level if one is stated or strongly implied; otherwise return null
5. Decide whether this is a new notification or an update to an existing one

NOTIFICATION TYPES:
- Advisory: CVE/patch notifications, threat bulletins, CISA/ICS-CERT/FDA cybersecurity advisories, vulnerability disclosures
- Recall: Medical device recalls, FDA safety communications about device removal or correction
- UpdateAvailable: Vendor firmware or software update announcements
- Other: Security-relevant notifications that don't fit the above categories

UPSERT DECISION:
- Return action "update" only when this email is clearly a follow-up or amendment to one of the provided existing notifications (same CVE IDs, same recall number, same product + version, explicit reference to a prior advisory)
- Return action "create" for anything new or ambiguous
- When action is "update", set notificationId to the id of the matching existing notification and set reasonWhy to a concise explanation of why this email was matched to that notification`;

// TODO:
// > Return action "update" only when this email is clearly a follow-up or amendment to one of the provided existing notifications (same CVE IDs, same recall number, same product + version, explicit reference to a prior advisory)
// This could almost certainly be made deterministic, or at least improved upon

function buildTextPrompt(input: {
  from: string;
  subject: string | null;
  markdown: string;
  existingNotifications: Array<{
    id: string;
    type: string;
    title: string | null;
    summary: string | null;
  }>;
}): string {
  // TODO: This could certainly be improved upon with something like a vector db, rather than just context-stuffing
  const existing =
    input.existingNotifications.length > 0
      ? input.existingNotifications
          .map(
            (n) =>
              `- id: ${n.id} | type: ${n.type} | title: ${n.title ?? "(untitled)"} | summary: ${n.summary ?? "(none)"}`,
          )
          .join("\n")
      : "(none)";

  return `From: ${input.from}
Subject: ${input.subject ?? "(no subject)"}

--- EMAIL BODY ---
${input.markdown}

--- EXISTING NOTIFICATIONS ---
${existing}`;
}

export async function classifyNotification(
  sourceId: string,
  email: { from: string; subject: string | null; markdown: string },
): Promise<ClassifyResult> {
  const [pdfAttachments, existingNotifications] = await Promise.all([
    fetchPdfAttachments(sourceId),
    prisma.notification.findMany({
      select: { id: true, type: true, title: true, summary: true },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  const model = new ChatAnthropic({
    model: MODEL,
    maxTokens: 1024,
  }).withStructuredOutput(classifySchema);

  const userContent = [
    {
      type: "text" as const,
      text: buildTextPrompt({ ...email, existingNotifications }),
    },
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

  const result = await model.invoke([
    { role: "system", content: SYSTEM_PROMPT },
    // biome-ignore lint/suspicious/noExplicitAny: cast userContent type for langchain
    new HumanMessage({ content: userContent as any }),
  ]);

  return result;
}
