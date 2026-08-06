import "server-only";
import { ChatAnthropic } from "@langchain/anthropic";
import type { QuestionWithIssue } from "@/features/questions/types";
import { buildEscalationContext, SYSTEM_PROMPT } from "./context";
import { escalationEmailschema } from "./schema";

const MODEL = "claude-haiku-4-5-20251001";

export async function draftEscalationEmail(question: QuestionWithIssue) {
  const model = new ChatAnthropic({
    model: MODEL,
    maxTokens: 2000,
  }).withStructuredOutput(escalationEmailschema);

  return model.invoke([
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: buildEscalationContext(question) },
  ]);
}
