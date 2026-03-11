"use client";

import { useAgent } from "@inngest/use-agent";

interface UseChatAgentConfig {
  systemPrompt?: string;
}

export function useChatAgent(config?: UseChatAgentConfig) {
  const agent = useAgent({
    state: () => ({
      systemPrompt: config?.systemPrompt,
    }),
    fetchThreads: async () => ({ threads: [], hasMore: false, total: 0 }),
    fetchHistory: async () => [],
  });

  return agent;
}
