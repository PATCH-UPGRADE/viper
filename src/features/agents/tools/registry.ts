/**
 * Tools are built per-request via a factory so they close over the userId
 * instead of threading it through LangGraph config.
 */
import "server-only";
import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { REQUEST_RECOMMENDATION_TOOL } from "../shared/recommendation-window";
import { makeRecordNoteTool } from "./note-tool";
import { makeQueryPlatformDataTool } from "./query-platform-tool";
import {
  makeEditReportTool,
  makeReadReportTool,
  makeSearchReportTool,
  makeWriteReportTool,
} from "./report-tool";
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

const requestRecommendation = tool(
  async () => "Consulting the remediation advisor.",
  {
    name: REQUEST_RECOMMENDATION_TOOL,
    description:
      "Hand this conversation to the remediation advisor. Call it first and on its own whenever the user wants a decision or plan rather than facts, even when the message names a device or is vague. Do not look anything up or ask clarifying questions first: the advisor does both. Decisions and plans: what to fix or do first; whether to patch now, wait, mitigate or accept the risk; how to protect a device that can't be patched; whether a device is safe to keep using; when to schedule downtime; how a fix affects patient care; any follow-up to a recommendation it gave. Examples: 'Is there a patch for this CVE?' is a fact, 'Should we apply it?' is a decision. 'Which devices run this firmware?' is a fact, 'Which should we fix first?' is a decision. 'What does KEV mean?' is a definition, 'Is MRI-01 safe to keep using?' is a decision. Not for lookups, counts, definitions, recording notes, or writing reports.",
    schema: z.object({}),
  },
);

/**
 * All model-facing tools, bound to a user and the thread being written to. The chat
 * model binds this whole set; the recommendation node binds the subset in RECOMMENDATION_TOOL_NAMES.
 * A tool added here must be described in the chat prompt, and in the recommendation node prompt
 * too if the recommendation node may call it.
 */
export function buildAgentTools(userId: string, reportThreadId: string) {
  // What was looked up this turn; report tools only accept citations to it.
  const retrieval = {
    ids: new Set<string>(),
    pending: new Set<Promise<unknown>>(),
  };
  return [
    makeQueryPlatformDataTool(userId, retrieval),
    askUserQuestions,
    requestRecommendation,
    ...makeWorkOrderTools(userId),
    makeRecordNoteTool(userId),
    makeSearchReportTool(userId, reportThreadId),
    makeReadReportTool(userId, reportThreadId),
    makeEditReportTool(userId, reportThreadId, retrieval),
    makeWriteReportTool(userId, reportThreadId, retrieval),
  ];
}
