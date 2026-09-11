/**
 * Tools are built per-request via a factory so they close over the userId
 * instead of threading it through LangGraph config.
 */
import "server-only";
import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { makeRecordNoteTool } from "./note-tool";
import { makeQueryPlatformDataTool } from "./query-platform-tool";
import { makeWorkOrderTools } from "./work-order-tools";

/** ```viper-ask-user ...``` block the chat UI parses to render question chips. */
const askUserQuestions = tool(
  async ({ questions }) => {
    return `\`\`\`viper-ask-user\n${JSON.stringify({ questions }, null, 2)}\n\`\`\``;
  },
  {
    name: "ask_user_questions",
    description:
      "Ask the user 1–4 clarifying questions in a single turn. Use this when missing information would meaningfully change the recommendation. Prefer batching related questions into one call rather than asking back-to-back. Each question includes suggested quick-reply answers; the user may always free-type instead.",
    schema: z.object({
      questions: z
        .array(
          z.object({
            question: z
              .string()
              .describe("The question, phrased for the user's role."),
            reason: z
              .string()
              .describe(
                "Why the answer is needed — what recommendation it unblocks.",
              ),
            suggested_answers: z
              .array(z.string())
              .min(2)
              .max(6)
              .describe(
                "2–6 short suggested answers rendered as quick-reply chips. The user may always free-type a different answer.",
              ),
          }),
        )
        .min(1)
        .max(4)
        .describe(
          "1–4 questions to ask. Batch related clarifications into one call to avoid multiple turns.",
        ),
    }),
  },
);

/**
 * All model-facing tools, bound to a user. Every conversational agent binds this
 * same set — `chat/graph.ts` and `recommendations/graph.ts` both call it — so a tool
 * added here is armed for all of them and must be described in each agent's prompt.
 */
export function buildAgentTools(userId: string) {
  return [
    makeQueryPlatformDataTool(userId),
    askUserQuestions,
    ...makeWorkOrderTools(userId),
    makeRecordNoteTool(userId),
  ];
}
