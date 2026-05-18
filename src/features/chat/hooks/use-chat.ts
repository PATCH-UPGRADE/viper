"use client";

import { useAgent } from "@inngest/use-agent";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useTRPC } from "@/trpc/client";
import { useChatUI } from "../context/chat-panel-context";
import type { UseChatAgentConfig } from "../types";
import { buildConversationMessages } from "../utils";

export function useChatAgent(config?: UseChatAgentConfig) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
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

  // Return [] so formatRawHistoryMessages (always called by useAgent) is bypassed.
  // Tool calls can't survive formatRawHistoryMessages — we inject full history via
  // replaceThreadMessages below instead.
  const fetchHistory = useCallback(
    async (_threadId: string): Promise<unknown[]> => [],
    [],
  );

  const agent = useAgent({
    state: () => ({
      userRole,
      ...config,
    }),
    deleteThread: (threadId: string) =>
      deleteThreadMutation({ threadId }).then(() => {}),
    fetchHistory,
  });

  const { currentThreadId, replaceThreadMessages } = agent;
  const loadedThreadRef = useRef<string | null>(null);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);

  useEffect(() => {
    if (!currentThreadId || loadedThreadRef.current === currentThreadId) return;
    loadedThreadRef.current = currentThreadId;
    setIsLoadingHistory(true);

    queryClient
      .fetchQuery(
        trpc.chat.getHistory.queryOptions({ threadId: currentThreadId }),
      )
      .then(({ messages }) => {
        // biome-ignore lint/suspicious/noExplicitAny: ConversationMessage generics not exported from use-agent
        const built = buildConversationMessages(messages) as any;
        replaceThreadMessages(currentThreadId, built);
      })
      .catch(() => {
        // Thread not yet in DB (brand-new thread) — no history to inject
      })
      .finally(() => {
        setIsLoadingHistory(false);
      });
  }, [
    currentThreadId,
    replaceThreadMessages,
    queryClient,
    trpc.chat.getHistory,
  ]);

  return { ...agent, isLoadingHistory };
}
