import "server-only";
import { ChatAnthropic } from "@langchain/anthropic";
import type { QuestionAudience } from "@/generated/prisma";
import { buildSystemPrompt } from "./context";
import { buildEscalationEmailSchema, type EscalationDraft } from "./schema";
import type { EscalationContext } from "./types";

const MODEL = "claude-haiku-4-5-20251001";

export async function draftEscalationEmail(
  context: EscalationContext,
  audience: QuestionAudience,
): Promise<EscalationDraft> {
  const schema = buildEscalationEmailSchema(
    audience,
    context.vendors.map((vendor) => vendor.id),
    context.vendors.flatMap((vendor) =>
      vendor.contacts.map((contact) => contact.id),
    ),
  );

  const model = new ChatAnthropic({
    model: MODEL,
    maxTokens: 2000,
  }).withStructuredOutput(schema);

  return model.invoke([
    { role: "system", content: buildSystemPrompt(audience) },
    { role: "user", content: context.markdown },
  ]);
}
