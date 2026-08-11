import "server-only";
import { z } from "zod";

const questionSchema = z.object({
  title: z.string(),
  reasonWhy: z.string(),
  suggestedAnswers: z.array(z.string()).min(2).max(6),
  audience: z
    .enum(["VENDOR", "MANUFACTURER"])
    .describe(
      "Who could answer this. MANUFACTURER when the company that built the device could answer from product knowledge alone - whether a component ships in the product, whether the flaw is reachable by design, whether a fix exists. VENDOR when it depends on how this hospital's own units are deployed, configured or serviced, which only whoever manages them would know. This is about what kind of party could answer.",
    ),
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
  audience: "VENDOR" | "MANUFACTURER";
};
export type QuestionResult = Record<string, QuestionValue | undefined>;
