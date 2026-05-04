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
import { createExplainAssetAgent } from "@/features/chat/viper-agent/agents/explain-asset";
import { createExplainVulnerabilityAgent } from "@/features/chat/viper-agent/agents/explain-vulnerability";
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
      case "explainAsset":
        agent = createExplainAssetAgent();
        break;
      case "explainVulnerability":
        agent = createExplainVulnerabilityAgent();
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
        // Stop routing once the agent has produced a final text response.
        // Keep routing while the last message was a tool call/result so the
        // agent gets a chance to process the tool output and reply.
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
