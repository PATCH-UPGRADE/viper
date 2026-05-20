import "server-only";
import {
  createAgent,
  type NetworkRun,
  type StateData,
} from "@inngest/agent-kit";
import type { NetworkState } from "@/features/chat/types";
import {
  RECOMMENDATION_ROLE_INSTRUCTIONS,
  type UserRole,
} from "@/features/chat/utils";
import { DEFAULT_CHAT_MODEL } from "../constants";
import { askUserQuestions } from "../tools/ask-user-questions";
import { manageMemoriesTool } from "../tools/manage-memories";
import { readMemories } from "../tools/read-memories";

const MODEL = DEFAULT_CHAT_MODEL;

const BASE_PROMPT = `You are a helpful AI assistant for a hospital vulnerability management platform (Viper).
You help hospital administrators and security engineers understand the operational impact
of vulnerabilities and remediations across systems, safety, and clinical workflows.
Be concise, accurate, and prioritize patient safety in your recommendations.

<tools>
- ask_user_questions: ask the user 1–4 clarifying questions with suggested answers.
  The agent turn ends here until the user replies.
- read_memories: read memories from chat history
- manage_memories: create, update, or delete persistent memories for this user.
</tools>

## Startup
Always call the read_memories tool before your first response in every
conversation. Use the returned context to personalize your guidance.

## Memory guidelines
Save persistent facts about the user: their role, hospital context, recurring concerns,
technical focus areas, and preferences that would be useful in future conversations.
Do NOT save one-time queries, general knowledge questions, or transient requests.
Before creating a memory, check existing memories to avoid duplicates.
Use update to correct outdated facts rather than creating a new memory.
Delete memories that are no longer accurate.

## Example
User says: "I'm a network security engineer. We had a ransomware attack on our imaging
systems last month and I need to prioritize patches for our radiology PACS servers."

Good memories to create:
- "User is a network security engineer"
- "User's hospital experienced a ransomware attack affecting imaging systems"
- "User is focused on radiology PACS server patch prioritization"

Do NOT save: "User asked about PACS patches" — that is a one-time query, not a persistent fact.`;

const buildSystemPrompt = (
  network: NetworkRun<StateData> | undefined,
): string => {
  const data = network?.state.data as NetworkState | undefined;
  const role: UserRole = data?.userRole ?? "hospital administration";
  return [
    BASE_PROMPT,
    `<user_role>The user's role is: ${role}. ${RECOMMENDATION_ROLE_INSTRUCTIONS[role]}</user_role>`,
  ].join("\n\n");
};

export const createChatAgent = () =>
  createAgent({
    name: "Viper Chat Assistant",
    description: "General assistant for hospital vulnerability management.",
    system: ({ network }) => buildSystemPrompt(network),
    model: MODEL,
    tools: [readMemories, manageMemoriesTool, askUserQuestions],
  });
