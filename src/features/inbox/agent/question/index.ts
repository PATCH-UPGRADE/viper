import "server-only";
import { ChatAnthropic } from "@langchain/anthropic";
import {
  gatherQuestionContext,
  type QuestionContext,
  SYSTEM_PROMPT,
} from "./context";
import {
  applyQuestionWrites,
  type QuestionApplySummary,
} from "./process_output";
import { buildQuestionSchema, type QuestionResult } from "./schema";

const MODEL = "claude-haiku-4-5-20251001";

export async function draftQuestion(
  context: QuestionContext,
): Promise<QuestionResult> {
  const issueIds = context.issues.map((issue) => issue.issueId);
  const schema = buildQuestionSchema(issueIds);

  const model = new ChatAnthropic({
    model: MODEL,
    maxTokens: 4000,
    thinking: { type: "enabled", budget_tokens: 2000 },
  }).withStructuredOutput(schema);

  return model.invoke([
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: context.markdown },
  ]);
}

export async function generateQuestionForNotification(
  notificationId: string,
): Promise<(QuestionApplySummary & { issues: number }) | null> {
  const context = await gatherQuestionContext(notificationId);

  if (!context) return null;
  const result = await draftQuestion(context);

  const summary = await applyQuestionWrites(context, result);

  return { ...summary, issues: context.issues.length };
}
