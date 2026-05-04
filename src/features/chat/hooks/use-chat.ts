"use client";

import { useAgent } from "@inngest/use-agent";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { useTRPC } from "@/trpc/client";

interface UseChatAgentConfig {
  systemPrompt?: string;
}

export function useChatAgent(config?: UseChatAgentConfig) {
  const trpc = useTRPC();

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
      systemPrompt: config?.systemPrompt,
    }),
    deleteThread: (threadId: string) =>
      deleteThreadMutation({ threadId }).then(() => {}),
  });

  return agent;
}
