import "server-only";
import { ChatAnthropic } from "@langchain/anthropic";
import { z } from "zod";

const MODEL = "claude-haiku-4-5-20251001";

const relevanceSchema = z.object({
  decision: z.enum(["relevant", "not_relevant"]),
  reason: z.string(),
});

const SYSTEM_PROMPT = `You are a triage agent for a hospital cybersecurity platform.

Determine whether an incoming email is relevant to hospital cybersecurity or operational security.

RELEVANT: security advisories, CVE/patch notifications, medical device recalls, FDA/ICS-CERT alerts, threat bulletins, vendor security notices, network incident reports, compliance alerts.
NOT RELEVANT: marketing emails, sales pitches, meeting invitations, thank-you notes, general newsletters, HR communications, billing receipts.`;

export async function checkEmailRelevance(email: {
  from: string;
  subject: string | null;
  bodyPreview: string;
}) {
  const model = new ChatAnthropic({
    model: MODEL,
    maxTokens: 256,
  }).withStructuredOutput(relevanceSchema);

  return model.invoke([
    { role: "system", content: SYSTEM_PROMPT },
    {
      role: "user",
      content: `From: ${email.from}
Subject: ${email.subject ?? "(no subject)"}

Body preview:
${email.bodyPreview}`,
    },
  ]);
}

export function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
