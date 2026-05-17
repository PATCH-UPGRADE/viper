// lots of code copied from docs: https://agentkit.inngest.com/concepts/history#usage

import {
  AgentResult,
  type HistoryConfig,
  type Message,
} from "@inngest/agent-kit";
import prisma from "@/lib/db";

// biome-ignore lint/suspicious/noExplicitAny: Inngest doesn't have an exported type for this
export const conversationHistoryAdapter: HistoryConfig<any> = {
  // 1. Create new conversation threads (or ensure they exist)
  createThread: async ({ state, input }) => {
    // If a threadId already exists, upsert to ensure it's in the database
    if (state.threadId) {
      await prisma.chatThread.upsert({
        where: { id: state.threadId },
        update: { updatedAt: new Date() },
        create: {
          id: state.threadId,
          userId: state.data.userId,
          title: input.slice(0, 50),
          createdAt: new Date(),
        },
      });
      return { threadId: state.threadId };
    }

    // Otherwise, create a new thread
    const thread = await prisma.chatThread.create({
      data: {
        userId: state.data.userId,
        title: input.slice(0, 50), // First 50 chars as title
        createdAt: new Date(),
      },
    });
    return { threadId: thread.id };
  },

  // 2. Load conversation history (including user messages)
  get: async ({ threadId }) => {
    if (!threadId) return [];

    const messages = await prisma.chatMessage.findMany({
      where: { threadId },
      orderBy: { createdAt: "asc" },
    });

    // Transform ALL messages (user + agent) to AgentResult format
    // This preserves the complete conversation order
    return messages.map((msg) => {
      if (msg.role === "USER") {
        // Convert user messages to AgentResult with agentName: "user"
        return new AgentResult(
          "user",
          [
            {
              type: "text" as const,
              role: "user" as const,
              content: msg.content ?? "",
              stop_reason: "stop",
            },
          ],
          [],
          new Date(msg.createdAt),
        );
      } else {
        const textMessage: Message = {
          type: "text" as const,
          role: "assistant" as const,
          content: msg.content ?? "",
        };
        const toolCallMessages: Message[] = Array.isArray(msg.toolCalls)
          ? (msg.toolCalls as unknown as Message[])
          : [];
        return new AgentResult(
          "assistant",
          [textMessage, ...toolCallMessages],
          [],
          new Date(msg.createdAt),
        );
      }
    });
  },

  // 3. Save user message immediately (before agents run)
  appendUserMessage: async ({ threadId, userMessage }) => {
    if (!threadId) return;

    await prisma.chatMessage.upsert({
      where: { id: userMessage.id },
      update: {
        content: userMessage.content,
        updatedAt: userMessage.timestamp,
      },
      create: {
        id: userMessage.id, // Use canonical client-generated ID
        threadId,
        role: "USER",
        content: userMessage.content,
        createdAt: userMessage.timestamp,
      },
    });
  },

  // 4. Save agent results after the run
  appendResults: async ({ threadId, newResults }) => {
    if (!threadId) return;

    // Save only agent responses (user message already saved)
    for (const result of newResults) {
      const content = result.output
        .filter((msg) => msg.type === "text")
        .map((msg) => msg.content)
        .join("\n");

      const toolCalls = result.output.filter(
        (msg) => msg.type === "tool_call" || msg.type === "tool_result",
      );

      await prisma.chatMessage.upsert({
        where: { id: result.id },
        update: { content, toolCalls, updatedAt: result.createdAt },
        create: {
          id: result.id || crypto.randomUUID(),
          threadId,
          role: "ASSISTANT",
          content,
          toolCalls,
          checksum: result.checksum,
          createdAt: result.createdAt,
        },
      });
    }
  },
};
