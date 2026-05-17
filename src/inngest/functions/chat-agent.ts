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
import { conversationHistoryAdapter } from "@/features/chat/viper-agent/history-adapter";
import { inngest } from "../client";

export const chatAgent = inngest.createFunction(
  {
    id: "chat-agent",
    name: "AI Chat Agent",
    retries: 0,
  },
  { event: "agent/chat.requested" },
  async ({ event, publish }) => {
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
      maxIter: 5,
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

    return {
      success: true,
      threadId,
      message: "Chat agent completed successfully",
    };
  },
);
