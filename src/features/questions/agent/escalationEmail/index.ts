import "server-only";
import { createChatModel } from "@/lib/llm/chat-model";
import { buildSystemPrompt } from "./context";
import { buildEscalationEmailSchema, type EscalationDraft } from "./schema";
import type { EscalationContext } from "./types";

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

  const model = createChatModel(
    "questions.escalation-email",
  ).withStructuredOutput(schema, {
    method: "functionCalling",
  });

  return model.invoke([
    { role: "system", content: buildSystemPrompt(context.audience) },
    { role: "user", content: context.markdown },
  ]);
}
