// The single triage gate for an inbound email: decide whether it is relevant at
// all, and if so whether it is an informational Notification or an actionable
// Work Order ticket.
//
// Relevance and routing are one call so the gate always sees the PDF
// attachments. Judging relevance on the body alone would drop a work order
// whose real content is only in the attachment.

import "server-only";
import { ChatAnthropic } from "@langchain/anthropic";
import { HumanMessage } from "@langchain/core/messages";
import { emailKindSchema } from "../types";

const MODEL = "claude-haiku-4-5-20251001";

const SYSTEM_PROMPT = `You triage inbound email for a hospital cybersecurity and operations platform. Judge the email on its body AND any attached PDFs together — an email's real content is often only in the attachment.

Choose exactly one kind:
- "work_order": relevant and ACTIONABLE — the email asks the hospital to DO something. Examples: a vendor service request or work order, a maintenance/patch/firmware request, a request to schedule or perform work on a device, an RMA, a manual task assignment.
- "notification": relevant and INFORMATIONAL — a security advisory, CVE/patch notice, vulnerability disclosure, medical device recall or safety communication, FDA/ICS-CERT alert, threat bulletin, vendor update announcement, or other FYI with no specific task asked of the hospital.
- "not_relevant": nothing to do with hospital cybersecurity, medical-device security, or device/infrastructure operations. Examples: marketing emails, sales pitches, meeting invitations, catering and food orders, thank-you notes, general newsletters, HR communications, billing receipts.

An attachment does not by itself make an email relevant — judge it on what it is actually about. A catering order with a PDF menu attached is still "not_relevant", even if it is dressed up in work-order language.

When an email is relevant but you are unsure between the other two, prefer "notification" unless it clearly asks the hospital to perform an action.

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
  email: { from: string; subject: string | null; markdown: string },
  pdfAttachments: Array<{ filename: string | null; base64: string }> = [],
) {
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
