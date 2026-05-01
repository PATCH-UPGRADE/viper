import {
  type AgentMessageChunk,
  anthropic,
  createAgent,
  createNetwork,
  createState,
  type StateData,
} from "@inngest/agent-kit";
import { createChannel } from "@/app/api/inngest/realtime";
import { inngest } from "../client";
import { conversationHistoryAdapter } from "@/features/chat/viper-agent/history-adapter";

const DEFAULT_SYSTEM_PROMPT = [
  "You are a helpful AI assistant for a hospital vulnerability management platform (Viper).",
  "You help hospital administrators understand the operational impact of vulnerabilities",
  "and remediations across systems, safety, and clinical workflows.",
  "Be concise, accurate, and prioritize patient safety in your recommendations.",
].join(" ");

// TODO: changeme back const MODEL_NAME = "claude-sonnet-4-20250514";
const MODEL_NAME = "claude-haiku-4-5-20251001";
const MAX_TOKENS = 4096;

export const chatAgent = inngest.createFunction(
  {
    id: "chat-agent",
    name: "AI Chat Agent",
    retries: 0,
  },
  { event: "agent/chat.requested" },
  async ({ event, publish }) => {
    const { userMessage, threadId, userId, history } = event.data;

    // TODO: useAgent currentlly places system prompt in userMessage state, move that
    // to event.data
    const systemPrompt =
      event.data.systemPrompt ??
      userMessage?.state?.systemPrompt ??
      DEFAULT_SYSTEM_PROMPT;

    if (!userId) {
      throw new Error("userId is required for chat agent execution");
    }

    const targetChannel = userId;

    const model = anthropic({
      model: MODEL_NAME,
      defaultParameters: { max_tokens: MAX_TOKENS },
    });

    const agent = createAgent({
      name: "Viper Chat Assistant",
      description: "A helpful assistant for hospital vulnerability management.",
      //system: systemPrompt ?? DEFAULT_SYSTEM_PROMPT,
      system: async ({ network }) => {
        console.log("HEY", JSON.stringify(network));
        return DEFAULT_SYSTEM_PROMPT;
      },
      model,
    });

    const network = createNetwork({
      name: "Chat Network",
      agents: [agent],
      defaultModel: model,
      maxIter: 1,
      router: async () => agent,
      history: conversationHistoryAdapter,
    });

    // the state is just the user id, message history, and threadid
    // TODO: store data from tool calls in network state? https://agentkit.inngest.com/concepts/state#using-state-in-tools
    const networkState = createState<StateData>(
      { userId },
      { messages: history ?? [], threadId },
    );

    await network.run(userMessage, {
      state: networkState,
      streaming: {
        publish: async (chunk: AgentMessageChunk) => {
          await publish(createChannel(targetChannel).agent_stream(chunk));
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
