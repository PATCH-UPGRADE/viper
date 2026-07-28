import "server-only";
import { ChatAnthropic } from "@langchain/anthropic";
import prisma from "@/lib/db";
import {
  gatherQuestionContext,
  gatherQuestionContextForIssue,
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

export async function generateFollowUpQuestion(
  issueId: string,
): Promise<(QuestionApplySummary & { issues: number }) | null> {
  const priorQuestions = await prisma.question.findMany({
    where: { issueId },
    orderBy: { createdAt: "asc" },
  });
  if (priorQuestions.length === 0) return null;
  const context = await gatherQuestionContextForIssue(
    issueId,
    priorQuestions[0].notificationId,
    priorQuestions.map((q) => ({ title: q.title, answer: q.answer })),
  );
  if (!context) return null;

  const result = await draftQuestion(context);
  const summary = await applyQuestionWrites(context, result);
  return { ...summary, issues: context.issues.length };
}
