// Returns details to create a new Notification or update an existing one
// classifies notification as Advisory/Recall/UpdateAvailable/Other (NotificationType)

import "server-only";
import { ChatOpenAI } from "@langchain/openai";
import { z } from "zod";
import { buildUserMessage, type PdfAttachment } from "@/lib/agent-messages";
import prisma from "@/lib/db";
import { deviceGroupMatchingLabel } from "@/lib/markdown";
import { notificationPayloadSchema, notRejected } from "../types";
import { fetchPdfAttachments } from "../utils";
import { emailPromptText, type InboundEmail } from "./prompt";

const MODEL = "gpt-6-luna";

// Flat schema required: a tool's parameters schema must have a top-level "type": "object",
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
2. Extract a concise, informative title (prefer manufacturer/vendor/CVE/device names over generic phrases)
3. Write a 1–3 sentence summary suitable for a hospital security officer
4. Assign a TLP level if one is stated or strongly implied; otherwise return null
5. Decide whether this is a new notification or an update to an existing one

NOTIFICATION TYPES:
- Advisory: CVE/patch notifications, threat bulletins, CISA/ICS-CERT/FDA cybersecurity advisories, vulnerability disclosures
- Recall: Medical device recalls, FDA safety communications about device removal or correction
- UpdateAvailable: Manufacturer or vendor firmware or software update announcements
- Other: Security-relevant notifications that don't fit the above categories

LINKED ENTITIES:
- The platform has already matched the email against its vulnerability database and device catalog. The LINKED ENTITIES section lists what it found, each with the confidence of the match.
- Prefer a linked CVE id or device name in the title over one read out of the prose; the linked form is the one the platform knows.

UPSERT DECISION:
- The EXISTING NOTIFICATIONS section lists the notifications that share a linked entity with this email. When nothing was linked, it lists every notification instead.
- Return action "update" only when this email is clearly a follow-up or amendment to one of the provided existing notifications (same CVE IDs, same recall number, same product + version, explicit reference to a prior advisory)
- Return action "create" for anything new or ambiguous
- When action is "update", set notificationId to the id of the matching existing notification and set reasonWhy to a concise explanation of why this email was matched to that notification`;

// TODO:
// > Return action "update" only when this email is clearly a follow-up or amendment to one of the provided existing notifications (same CVE IDs, same recall number, same product + version, explicit reference to a prior advisory)
// This could almost certainly be made deterministic, or at least improved upon

type Linked = { label: string; confidence: string | null };

export type ClassifyContext = {
  linked: { vulnerabilities: Linked[]; deviceGroups: Linked[] };
  existingNotifications: Array<{
    id: string;
    type: string;
    title: string | null;
    summary: string | null;
  }>;
};

/**
 * What the record links, and the notifications the email can update.
 *
 * The candidates are the notifications whose records share a linked
 * vulnerability or device group, so the list does not grow with the database.
 * A record that links nothing has no such list, so it gets every notification,
 * newest first: a recall number or a plain reference to an earlier advisory
 * can still name one.
 */
export async function classifyContext(
  sourceId: string,
): Promise<ClassifyContext> {
  const record = await prisma.sourceRecord.findUniqueOrThrow({
    where: { id: sourceId },
    select: {
      vulnerabilities: {
        where: notRejected,
        select: {
          vulnerabilityId: true,
          confidence: true,
          vulnerability: { select: { displayId: true } },
        },
      },
      deviceGroupMatchings: {
        where: notRejected,
        select: {
          deviceGroupMatchingId: true,
          confidence: true,
          deviceGroupMatching: {
            include: { manufacturer: true, product: true, version: true },
          },
        },
      },
    },
  });

  const vulnerabilityIds = record.vulnerabilities.map((m) => m.vulnerabilityId);
  const matchingIds = record.deviceGroupMatchings.map(
    (m) => m.deviceGroupMatchingId,
  );
  const sharesALink =
    vulnerabilityIds.length + matchingIds.length > 0
      ? {
          sourceLinks: {
            some: {
              sourceRecord: {
                OR: [
                  {
                    vulnerabilities: {
                      some: { vulnerabilityId: { in: vulnerabilityIds } },
                    },
                  },
                  {
                    deviceGroupMatchings: {
                      some: { deviceGroupMatchingId: { in: matchingIds } },
                    },
                  },
                ],
              },
            },
          },
        }
      : {};

  const existingNotifications = await prisma.notification.findMany({
    where: sharesALink,
    select: { id: true, type: true, title: true, summary: true },
    orderBy: { createdAt: "desc" },
  });

  return {
    linked: {
      vulnerabilities: record.vulnerabilities.map((m) => ({
        label: m.vulnerability.displayId,
        confidence: m.confidence,
      })),
      deviceGroups: record.deviceGroupMatchings.map((m) => ({
        label: deviceGroupMatchingLabel(m.deviceGroupMatching),
        confidence: m.confidence,
      })),
    },
    existingNotifications,
  };
}

const linkedLines = (items: Linked[]): string =>
  items.length > 0
    ? items
        .map(
          (item) =>
            `- ${item.label}${item.confidence ? ` (${item.confidence})` : ""}`,
        )
        .join("\n")
    : "(none)";

export function buildTextPrompt(
  email: InboundEmail,
  context: ClassifyContext,
): string {
  const existing =
    context.existingNotifications.length > 0
      ? context.existingNotifications
          .map(
            (n) =>
              `- id: ${n.id} | type: ${n.type} | title: ${n.title ?? "(untitled)"} | summary: ${n.summary ?? "(none)"}`,
          )
          .join("\n")
      : "(none)";

  return `${emailPromptText(email)}

--- LINKED ENTITIES ---
Vulnerabilities:
${linkedLines(context.linked.vulnerabilities)}
Device groups:
${linkedLines(context.linked.deviceGroups)}

--- EXISTING NOTIFICATIONS ---
${existing}`;
}

export async function classifyNotification(
  sourceId: string,
  email: InboundEmail,
  inlinedPdfs?: PdfAttachment[],
): Promise<ClassifyResult> {
  const [pdfAttachments, context] = await Promise.all([
    inlinedPdfs ?? fetchPdfAttachments(sourceId),
    classifyContext(sourceId),
  ]);

  const model = new ChatOpenAI({
    model: MODEL,
    useResponsesApi: true,
    reasoning: { effort: "none" },
    maxTokens: 1024,
  }).withStructuredOutput(classifySchema, { method: "functionCalling" });

  const result = await model.invoke([
    { role: "system", content: SYSTEM_PROMPT },
    buildUserMessage(buildTextPrompt(email, context), pdfAttachments),
  ]);

  return result;
}
