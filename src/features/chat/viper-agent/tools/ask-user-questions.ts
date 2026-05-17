import "server-only";
import { createTool } from "@inngest/agent-kit";
import { z } from "zod";

const questionSchema = z.object({
  question: z.string().describe("The question, phrased for the user's role."),
  reason: z
    .string()
    .describe("Why the answer is needed — what recommendation it unblocks."),
  suggested_answers: z
    .array(z.string())
    .min(2)
    .max(6)
    .describe(
      "2–6 short suggested answers rendered as quick-reply chips. The user may always free-type a different answer.",
    ),
});

export const askUserQuestions = createTool({
  name: "ask_user_questions",
  description:
    "Ask the user 1–4 clarifying questions in a single turn. Use this when missing information would meaningfully change the recommendation. Prefer batching related questions into one call rather than asking back-to-back. Each question includes suggested quick-reply answers; the user may always free-type instead.",
  parameters: z.object({
    questions: z
      .array(questionSchema)
      .min(1)
      .max(4)
      .describe(
        "1–4 questions to ask. Batch related clarifications into one call to avoid multiple turns.",
      ),
  }),
  handler: async ({ questions }) => {
    // Returns a sentinel block the chat UI can parse to render quick-reply chips.
    // Falls back gracefully as readable plain text if the UI does not handle it.
    const payload = JSON.stringify({ questions }, null, 2);
    return `\`\`\`viper-ask-user\n${payload}\n\`\`\``;
  },
});
