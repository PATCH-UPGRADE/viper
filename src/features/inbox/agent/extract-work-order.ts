// Extracts the fields needed to populate a WorkOrderTicket from an actionable
// (work-order) email. The ticket body is taken from the email markdown
// directly; this agent only produces the structured fields around it.

import "server-only";
import { ChatAnthropic } from "@langchain/anthropic";
import { HumanMessage } from "@langchain/core/messages";
import prisma from "@/lib/db";
import { type WorkOrderPayload, workOrderPayloadSchema } from "../types";
import { fetchPdfAttachments } from "../utils";

const MODEL = "claude-haiku-4-5-20251001";

const SYSTEM_PROMPT = `You extract structured fields for a hospital work-order ticket from an actionable email.

Produce:
- summary: a concise, action-oriented title (prefer device/vendor specifics over generic phrasing)
- category: the best-fit work category from the allowed set; use OTHER when unsure
- scheduledAt: an ISO 8601 date (YYYY-MM-DD or full timestamp) ONLY if the email states a due/scheduled date; otherwise null
- suggestedAssignee: the responsible party if the email names one (often an external vendor or a person/team); otherwise null
- departmentNames: EVERY hospital department mentioned or implied anywhere in the email — including ones named only in a coordination/aside note (e.g. "have Biomed stage the units"). Choose names ONLY from the "Valid departments" list provided below, copying the spelling exactly; return [] if none apply.

Only include values you are reasonably confident about. Do not invent dates or assignees, and never invent a department that isn't in the provided list.`;

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

export async function extractWorkOrder(
  sourceId: string,
  email: { from: string; subject: string | null; markdown: string },
): Promise<WorkOrderPayload> {
  const [pdfAttachments, departments] = await Promise.all([
    fetchPdfAttachments(sourceId),
    prisma.department.findMany({
      select: { name: true },
      orderBy: { name: "asc" },
    }),
  ]);
  const validDepartments =
    departments.map((d) => d.name).join(", ") || "(none configured)";

  const model = new ChatAnthropic({
    model: MODEL,
    maxTokens: 1024,
  }).withStructuredOutput(workOrderPayloadSchema);

  const userContent = [
    {
      type: "text" as const,
      text: `${buildTextPrompt(email)}\n\nValid departments (choose only from these): ${validDepartments}`,
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

  return model.invoke([
    { role: "system", content: SYSTEM_PROMPT },
    // biome-ignore lint/suspicious/noExplicitAny: cast userContent type for langchain
    new HumanMessage({ content: userContent as any }),
  ]);
}
