"use client";

import { useAgent } from "@inngest/use-agent";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { useTRPC } from "@/trpc/client";
import { useChatUI } from "../context/chat-panel-context";
import type { UseChatAgentConfig } from "../types";

export function useChatAgent(config?: UseChatAgentConfig) {
  const trpc = useTRPC();
  const { userRole } = useChatUI();

  const { mutateAsync: deleteThreadMutation } = useMutation(
    trpc.chat.deleteThread.mutationOptions({
      onSuccess: () => {
        toast.success("Thread deleted");
      },
      onError: (error) => {
        toast.error(`Failed to delete thread: ${error.message}`);
      },
    }),
  );

  const agent = useAgent({
    state: () => ({
      agent: config?.agent ?? "chat",
      assetData: config?.assetData,
      vulnerabilityData: config?.vulnerabilityData,
      userRole,
    }),
    deleteThread: (threadId: string) =>
      deleteThreadMutation({ threadId }).then(() => {}),
  });

  return agent;
}
