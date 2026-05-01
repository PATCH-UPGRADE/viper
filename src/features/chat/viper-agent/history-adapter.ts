import prisma from "@/lib/db";
import { AgentResult, HistoryConfig } from "@inngest/agent-kit";

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
              content: msg.content as string,
              stop_reason: "stop",
            },
          ],
          [],
          new Date(msg.createdAt),
        );
      } else {
        // Return agent results
        return new AgentResult(
          "assistant", // TODO: could be something like msg.agentName
          [
            {
              type: "text" as const,
              role: "assistant" as const,
              content: msg.content as string,
            },
          ],
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

      await prisma.chatMessage.upsert({
        where: { id: result.id },
        update: { content, updatedAt: result.createdAt },
        create: {
          id: result.id || crypto.randomUUID(), // Use result.id if available
          threadId,
          role: "ASSISTANT",
          //agentName: result.agentName,
          content,
          checksum: result.checksum, // For idempotency
          createdAt: result.createdAt,
        },
      });
    }
  },
};
