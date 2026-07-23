import "server-only";
import { ChatAnthropic } from "@langchain/anthropic";
import {
  gatherQuestionContext,
  SYSTEM_PROMPT,
  type QuestionContext,
} from "./context";
import {
  applyQuestionWrites,
  type QuestionApplySummary,
} from "./process_output";
import { buildQuestionSchema, type QuestionResult } from "./schema";

const MODEL = "claude-sonnet-4-6";

function extractJsonBlock(text: string): string {
  const jsonBlkText = text.match(/```(?:json)?\s([\s\S]*?)```/);
  return jsonBlkText ? jsonBlkText[1] : text;
}

export async function draftQuestion(
  context: QuestionContext,
): Promise<QuestionResult> {
  const issueIds = context.issues.map((issue) => issue.issueId);
  const schema = buildQuestionSchema(issueIds);

  const model = new ChatAnthropic({
    model: MODEL,
    maxTokens: 4000,
    thinking: { type: "enabled", budget_tokens: 2000 },
  });

  const res = await model.invoke([
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: context.markdown },
  ]);

  let raw: unknown;
  try {
    raw = JSON.parse(extractJsonBlock(res.text));
  } catch (e) {
    return {};
  }
  const parsed = schema.safeParse(raw);

  return parsed.success ? parsed.data : {};
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
