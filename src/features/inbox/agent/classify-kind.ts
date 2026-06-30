// Routes a relevant inbound email to the right entity: an informational
// Notification, or an actionable Work Order ticket.

import "server-only";
import { ChatAnthropic } from "@langchain/anthropic";
import { HumanMessage } from "@langchain/core/messages";
import { emailKindSchema } from "../types";
import { fetchPdfAttachments } from "../utils";

const MODEL = "claude-haiku-4-5-20251001";

const SYSTEM_PROMPT = `You route inbound emails for a hospital security & operations platform.

Decide whether an email is a NOTIFICATION or a WORK ORDER:
- "work_order": the email is an ACTIONABLE request directed at the hospital — something a person needs to DO. Examples: a vendor service request or work order, a maintenance/patch/firmware request, a request to schedule or perform work on a device, an RMA, a manual task assignment.
- "notification": the email is INFORMATIONAL — a security advisory, vulnerability disclosure, device recall/safety communication, vendor update announcement, threat bulletin, or other FYI with no specific task asked of the hospital.

When in doubt between the two, prefer "notification" unless the email clearly asks the hospital to perform an action.

Always give a concise reasonWhy.`;

function buildTextPrompt(email: {
  from: string;
  subject: string | null;
  markdown: string;
}): string {
  return `From: ${email.from}
Subject: ${email.subject ?? "(no subject)"}

--- EMAIL BODY ---
${email.markdown}`;
}

export async function classifyEmailKind(
  sourceId: string,
  email: { from: string; subject: string | null; markdown: string },
) {
  const pdfAttachments = await fetchPdfAttachments(sourceId);

  const model = new ChatAnthropic({
    model: MODEL,
    maxTokens: 256,
  }).withStructuredOutput(emailKindSchema);

  const userContent = [
    { type: "text" as const, text: buildTextPrompt(email) },
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
