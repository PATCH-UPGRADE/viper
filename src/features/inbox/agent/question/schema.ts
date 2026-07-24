import "server-only";
import { z } from "zod";

const questionSchema = z.object({
  title: z.string(),
  reasonWhy: z.string(),
  suggestedAnswers: z.array(z.string()).min(2).max(6),
});

export function buildQuestionSchema(issueIds: string[]) {
  return z.object(
    Object.fromEntries(issueIds.map((id) => [id, questionSchema.optional()])),
  );
}

export type QuestionValue = {
  title: string;
  reasonWhy: string;
  suggestedAnswers: string[];
};
export type QuestionResult = Record<string, QuestionValue | undefined>;
