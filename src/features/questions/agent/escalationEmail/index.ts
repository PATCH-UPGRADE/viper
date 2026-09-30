import "server-only";
import { ChatOpenAI } from "@langchain/openai";
import { buildSystemPrompt } from "./context";
import { buildEscalationEmailSchema, type EscalationDraft } from "./schema";
import type { EscalationContext } from "./types";

const MODEL = "gpt-6-luna";

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

  const model = new ChatOpenAI({
    model: MODEL,
    useResponsesApi: true,
    reasoning: { effort: "none" },
    maxTokens: 2000,
  }).withStructuredOutput(schema, { method: "functionCalling" });

  return model.invoke([
    { role: "system", content: buildSystemPrompt(context.audience) },
    { role: "user", content: context.markdown },
  ]);
}
