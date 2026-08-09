import "server-only";
import { ChatAnthropic } from "@langchain/anthropic";
import { SYSTEM_PROMPT } from "./context";
import { buildEscalationEmailSchema, type EscalationDraft } from "./schema";
import type { EscalationContext } from "./types";

const MODEL = "claude-haiku-4-5-20251001";

export async function draftEscalationEmail(
  context: EscalationContext,
): Promise<EscalationDraft> {
  const schema = buildEscalationEmailSchema(
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
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: context.markdown },
  ]);
}
