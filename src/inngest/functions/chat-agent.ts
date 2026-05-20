import "server-only";
import {
  type Agent,
  type AgentMessageChunk,
  createNetwork,
  createState,
  type StateData,
} from "@inngest/agent-kit";
import { createChannel } from "@/app/api/inngest/realtime";
import type { NetworkState } from "@/features/chat/types";
import { createChatAgent } from "@/features/chat/viper-agent/agents/chat-agent";
import { createGiveRecommendationsAgent } from "@/features/chat/viper-agent/agents/give-recommendations";
import { generateThreadTitle } from "@/features/chat/viper-agent/generate-thread-title";
import { conversationHistoryAdapter } from "@/features/chat/viper-agent/history-adapter";
import prisma from "@/lib/db";
import { inngest } from "../client";

export const chatAgent = inngest.createFunction(
  {
    id: "chat-agent",
    name: "AI Chat Agent",
    retries: 0,
  },
  { event: "agent/chat.requested" },
  async ({ event, publish, step }) => {
    const { userMessage, threadId, userId, history } = event.data;

    if (!userId) {
      throw new Error("userId is required for chat agent execution");
    }

    const clientState: NetworkState = userMessage?.state ?? {};

    let agent: Agent<StateData>;
    switch (clientState.agent) {
      case "giveRecommendations":
        agent = createGiveRecommendationsAgent();
        break;
      default:
        agent = createChatAgent();
    }

    const network = createNetwork({
      name: "Chat Network",
      agents: [agent],
      maxIter: 8,
      router: async ({ network: net }) => {
        const results = net.state.results;
        if (results.length === 0) return agent;
        const lastOutput = results[results.length - 1].output;
        const lastMsg = lastOutput[lastOutput.length - 1];
        // If ask_user_questions was called anywhere in this turn, stop immediately
        // so the user can respond.
        const askedUser = lastOutput.some(
          (msg) =>
            msg.type === "tool_call" &&
            msg.tools.some((msg) => msg.name === "ask_user_questions"),
        );
        if (askedUser) return undefined;
        if (lastMsg?.stop_reason === "stop") return undefined;
        return agent;
      },
      history: conversationHistoryAdapter,
    });

    const networkState = createState<StateData>(
      { userId, ...clientState },
      { messages: history ?? [], threadId },
    );

    await network.run(userMessage, {
      state: networkState,
      streaming: {
        publish: async (chunk: AgentMessageChunk) => {
          await publish(createChannel(userId).agent_stream(chunk));
        },
      },
    });

    if (threadId) {
      await step.run("maybe-generate-thread-title", async () => {
        // Only generate on the first exchange. We gate on user-message count
        // because a single user turn can produce multiple assistant rows (tool
        // loops, multiple iterations of the router).
        const userCount = await prisma.chatMessage.count({
          where: { threadId, role: "USER" },
        });
        if (userCount !== 1) return { skipped: "not-first-exchange" as const };

        const [firstUser, assistantMessages] = await Promise.all([
          prisma.chatMessage.findFirst({
            where: { threadId, role: "USER" },
            orderBy: { createdAt: "asc" },
          }),
          prisma.chatMessage.findMany({
            where: { threadId, role: "ASSISTANT" },
            orderBy: { createdAt: "asc" },
          }),
        ]);

        const assistantText = assistantMessages
          .map((m) => m.content ?? "")
          .filter((c) => c.trim().length > 0)
          .join("\n\n")
          .trim();

        if (!firstUser?.content) {
          return { skipped: "missing-user-message" as const };
        }

        const title = await generateThreadTitle({
          userMessage: firstUser.content,
          assistantText,
        });
        if (!title) return { skipped: "generation-failed" as const };

        await prisma.chatThread.update({
          where: { id: threadId, userId },
          data: { title },
        });
        await publish(
          createChannel(userId).thread_updated({ threadId, title }),
        );
        return { title };
      });
    }

    return {
      success: true,
      threadId,
      message: "Chat agent completed successfully",
    };
  },
);
