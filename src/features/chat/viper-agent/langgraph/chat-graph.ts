import "server-only";
import { ChatAnthropic } from "@langchain/anthropic";
import { SystemMessage } from "@langchain/core/messages";
import {
  generateMemoryMarkdown,
  RECOMMENDATION_ROLE_INSTRUCTIONS,
  type UserRole,
} from "@/features/chat/utils";
import prisma from "@/lib/db";
import { buildAgentGraph } from "./build-graph";
import { buildChatTools } from "./tools";

const CHAT_MODEL = "claude-haiku-4-5-20251001";

const BASE_PROMPT = `You are a helpful AI assistant for a hospital vulnerability management platform (Viper).
You help hospital administrators and security engineers understand the operational impact
of vulnerabilities and remediations across systems, safety, and clinical workflows.
Be concise, accurate, and prioritize patient safety in your recommendations.

<tools>
- ask_user_questions: ask the user 1–4 clarifying questions with suggested answers.
  The agent turn ends here until the user replies.
- manage_memories: create, update, or delete persistent memories for this user.
</tools>

## Memory
Your saved memories about this user are provided below as context — you do not
need to fetch them. Save new persistent facts (role, hospital context, recurring
concerns, technical focus, preferences) with manage_memories. Do NOT save
one-time queries or transient requests. Avoid duplicates — update existing
memories (by id) rather than creating near-identical ones; delete stale ones.`;

function buildSystemPrompt(role: UserRole): string {
  return [
    BASE_PROMPT,
    `<user_role>The user's role is: ${role}. ${RECOMMENDATION_ROLE_INSTRUCTIONS[role]}</user_role>`,
  ].join("\n\n");
}

type MemoryRow = { id: string; content: string | null };

/** Default memory source — overridable for tests / DB-less verification. */
function prismaMemoryLoader(userId: string): () => Promise<MemoryRow[]> {
  return () =>
    prisma.memory.findMany({
      where: { userId },
      orderBy: { createdAt: "asc" },
    });
}

export function buildChatGraph({
  userId,
  userRole = "hospital administration",
  loadMemories = prismaMemoryLoader(userId),
}: {
  userId: string;
  userRole?: UserRole;
  loadMemories?: () => Promise<MemoryRow[]>;
}) {
  const tools = buildChatTools(userId);
  const model = new ChatAnthropic({
    model: CHAT_MODEL,
    maxTokens: 4096,
    streaming: true,
  }).bindTools(tools);

  return buildAgentGraph({
    model,
    tools,
    systemMessage: new SystemMessage(buildSystemPrompt(userRole)),
    preload: async () => generateMemoryMarkdown(await loadMemories()),
  });
}
