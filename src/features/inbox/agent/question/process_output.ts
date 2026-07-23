import "server-only";
import prisma from "@/lib/db";
import type { QuestionContext } from "./context";
import type { QuestionResult, QuestionValue } from "./schema";

export type QuestionApplySummary = { created: number };
type QuestionCreateOp = {
  issueId: string;
  notificationId: string;
} & QuestionValue;

export function planQuestionWrites(
  context: QuestionContext,
  result: QuestionResult,
): QuestionCreateOp[] {
  const issueIds = new Set(context.issues.map((i) => i.issueId));
  const ops: QuestionCreateOp[] = [];

  for (const [issueId, value] of Object.entries(result)) {
    if (!issueIds.has(issueId) || !value) continue;
    if (!value.title.trim() || value.suggestedAnswers.length < 2) continue;
    ops.push({ issueId, notificationId: context.notificationId, ...value });
  }
  return ops;
}

export async function applyQuestionWrites(
  context: QuestionContext,
  result: QuestionResult,
): Promise<QuestionApplySummary> {
  const ops = planQuestionWrites(context, result);

  await prisma.$transaction(
    ops.map((op) =>
      prisma.question.create({
        data: {
          issueId: op.issueId,
          notificationId: op.notificationId,
          title: op.title,
          reasonWhy: op.reasonWhy,
          suggestedAnswers: op.suggestedAnswers,
        },
      }),
    ),
  );
  return { created: ops.length };
}
