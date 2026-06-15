/**
 * LangChain ports of the Viper chat tools (was @inngest/agent-kit createTool).
 *
 * `read_memories` is NOT a model tool here — memories are preloaded
 * deterministically by the graph's loadMemories node (see chat-graph.ts and the
 * Phase 0 SPIKE FINDING: deterministic context is more reliable than a forced/
 * prompt-begged first tool call, and avoids killing extended thinking).
 *
 * Tools are built per-request via a factory so they close over the userId
 * instead of threading it through LangGraph config.
 */
import "server-only";
import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { inngest } from "@/inngest/client";

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

/** Schedule memory create/update/delete via the existing Inngest function. */
function makeManageMemoriesTool(userId: string) {
  return tool(
    async ({ creations, updates, deletions }) => {
      const operations = [
        ...(creations ?? []).map((content) => ({ content })),
        ...(updates ?? []).map(({ id, statement }) => ({
          id,
          content: statement,
        })),
        ...(deletions ?? []).map(({ id }) => ({ id, delete: true as const })),
      ];

      if (operations.length === 0) return "No operations to perform.";

      // Outside AgentKit's step context we publish the event directly; the
      // existing manageMemoriesFn Inngest function processes it unchanged.
      await inngest.send({
        name: "app/memories.manage",
        data: { userId, operations },
      });

      return `Scheduled ${operations.length} memory operation(s).`;
    },
    {
      name: "manage_memories",
      description: `Create, update, and/or delete memories in a single atomic operation.
Use this to persist meaningful facts about the user (role, hospital context, recurring concerns, technical focus areas).
Avoid duplicates — use update if a similar memory already exists.
Do not save one-time queries or transient requests.`,
      schema: z.object({
        creations: z
          .array(z.string())
          .optional()
          .describe("New statements to save as memories."),
        updates: z
          .array(
            z.object({
              id: z.string().describe("ID of the memory to update."),
              statement: z
                .string()
                .describe("The corrected information to save."),
            }),
          )
          .optional()
          .describe("Memories to update."),
        deletions: z
          .array(z.object({ id: z.string().describe("ID of the memory to delete.") }))
          .optional()
          .describe("Memories to delete."),
      }),
    },
  );
}

/** All model-facing tools for the Chat agent, bound to a user. */
export function buildChatTools(userId: string) {
  return [makeManageMemoriesTool(userId), askUserQuestions];
}
