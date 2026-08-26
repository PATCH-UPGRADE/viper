import "server-only";
import { ChatAnthropic } from "@langchain/anthropic";
import { buildSystemPrompt } from "./context";
import { buildEscalationEmailSchema, type EscalationDraft } from "./schema";
import type { EscalationContext } from "./types";

const MODEL = "claude-haiku-4-5-20251001";

export async function draftEscalationEmail(
  context: EscalationContext,
): Promise<EscalationDraft> {
  const schema = buildEscalationEmailSchema(
    context.audience,
    context.relationships.map((rel) => rel.id),
    context.relationships.flatMap((rel) =>
      rel.contacts.map((contact) => contact.id),
    ),
  );

  const model = new ChatAnthropic({
    model: MODEL,
    maxTokens: 2000,
  }).withStructuredOutput(schema);

  return model.invoke([
    { role: "system", content: buildSystemPrompt(context.audience) },
    { role: "user", content: context.markdown },
  ]);
}
