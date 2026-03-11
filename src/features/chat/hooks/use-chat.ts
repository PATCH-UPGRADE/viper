"use client";

import { useAgent } from "@inngest/use-agent";

interface UseChatAgentConfig {
  systemPrompt?: string;
}

export function useChatAgent(config?: UseChatAgentConfig) {
  // I love useAgent, this is great. Anyways `agent` this gives you the following
  // const { messages, sendMessage, status, currentThreadId, switchToThread } = useAgent();
  // https://agentkit.inngest.com/reference/use-agent#useagent
  const agent = useAgent({
    state: () => ({
      systemPrompt: config?.systemPrompt,
    }),
    fetchThreads: async () => ({ threads: [], hasMore: false, total: 0 }),
    fetchHistory: async () => [],
  });

  return agent;
}
