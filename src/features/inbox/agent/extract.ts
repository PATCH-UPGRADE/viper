import "server-only";
import { ChatAnthropic } from "@langchain/anthropic";
import { HumanMessage } from "@langchain/core/messages";
import { fetchPdfAttachments } from "../utils";
import { ExtractResult, extractSchema } from "../types";

const MODEL = "claude-haiku-4-5-20251001";

const SYSTEM_PROMPT = `You are an extraction agent for a hospital cybersecurity platform that reads security notifications (advisories, recalls, update notices) and their PDF attachments.

Your task: extract the DEVICE GROUPS that the notification is about. A device group is a class of affected product, identified by some combination of:
- CPE string (e.g. "cpe:2.3:a:vendor:product:1.0:*:*:*:*:*:*:*")
- manufacturer / vendor (e.g. "Philips", "GE Healthcare")
- model name (e.g. "IntelliVue MX40", "Alaris Pump")
- version / firmware (e.g. "2.3.1")

RULES:
- Extract ONLY device groups explicitly referenced in the notification or its attachments.
- Omit any field you are unsure about; do not guess or fabricate CPEs, models, or versions.
- If the notification references no specific device, return an empty deviceGroups array.
- Each distinct affected product should be its own entry.`;

export async function extractEntities(
  sourceId: string,
  email: { from: string; subject: string | null; markdown: string },
): Promise<ExtractResult> {
  const pdfAttachments = await fetchPdfAttachments(sourceId);

  const model = new ChatAnthropic({
    model: MODEL,
    maxTokens: 2048,
  }).withStructuredOutput(extractSchema);

  const textPrompt = `From: ${email.from}
Subject: ${email.subject ?? "(no subject)"}

--- NOTIFICATION BODY ---
${email.markdown}`;

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
