/**
 * Prisma-backed conversation history for the LangGraph chat path. Replaces the
 * @inngest/agent-kit HistoryConfig adapter (history-adapter.ts).
 *
 * Hydration is TEXT-ONLY by design: we feed prior USER/ASSISTANT text back to
 * the model but NOT reconstructed tool_call/ToolMessage pairs. Anthropic rejects
 * an assistant tool_use turn that isn't immediately followed by matching
 * tool_result blocks, so reconstructing partial/cross-format (old AgentKit) tool
 * history is fragile. The assistant's text already summarizes tool outcomes, so
 * text-only hydration is both safe and sufficient. `toolCalls` is still
 * persisted for the UI to render.
 */
import "server-only";
import {
  AIMessage,
  type BaseMessage,
  HumanMessage,
} from "@langchain/core/messages";
import prisma from "@/lib/db";

/** Ensure the thread row exists (created lazily on first message). */
export async function ensureThread(
  threadId: string,
  userId: string,
  firstUserContent: string,
): Promise<void> {
  await prisma.chatThread.upsert({
    where: { id: threadId },
    update: { updatedAt: new Date() },
    create: {
      id: threadId,
      userId,
      title: firstUserContent.slice(0, 50),
    },
  });
}

/** Persist the user's message before the agent runs (idempotent by id). */
export async function saveUserMessage(
  threadId: string,
  id: string,
  content: string,
): Promise<void> {
  await prisma.chatMessage.upsert({
    where: { id },
    update: { content },
    create: { id, threadId, role: "USER", content },
  });
}

/** Persist an assistant turn (text + tool calls JSON for the UI). */
export async function saveAssistantMessage(
  threadId: string,
  content: string,
  // biome-ignore lint/suspicious/noExplicitAny: serialized UI tool parts
  toolCalls: any[],
): Promise<void> {
  await prisma.chatMessage.create({
    data: {
      threadId,
      role: "ASSISTANT",
      content,
      toolCalls: toolCalls.length ? toolCalls : undefined,
    },
  });
}

/** Load prior turns as LangChain messages (text-only — see file header). */
export async function loadHistoryMessages(
  threadId: string,
): Promise<BaseMessage[]> {
  const rows = await prisma.chatMessage.findMany({
    where: { threadId },
    orderBy: { createdAt: "asc" },
  });

  return rows
    .filter((r) => (r.content ?? "").trim().length > 0)
    .map((r) =>
      r.role === "USER"
        ? new HumanMessage(r.content ?? "")
        : new AIMessage(r.content ?? ""),
    );
}

/** Count of USER messages — used to gate first-exchange title generation. */
export function userMessageCount(threadId: string): Promise<number> {
  return prisma.chatMessage.count({ where: { threadId, role: "USER" } });
}
