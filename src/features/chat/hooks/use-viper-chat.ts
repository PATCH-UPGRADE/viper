"use client";

/**
 * Thread-aware chat hook for the LangGraph chat route (/api/chat), built on
 * `@ai-sdk/react` useChat (single conversation) + tRPC for the thread list and
 * history. Replaces the @inngest/use-agent multi-thread hook (use-chat.ts).
 */
import { useChat } from "@ai-sdk/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { DefaultChatTransport } from "ai";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { useChatUI } from "@/features/chat/context/chat-panel-context";
import type { UseChatAgentConfig } from "@/features/chat/types";
import { useTRPC } from "@/trpc/client";

export function useViperChat(config?: UseChatAgentConfig) {
  const { userRole } = useChatUI();
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  const transport = useMemo(
    () => new DefaultChatTransport({ api: "/api/chat" }),
    [],
  );
  const {
    messages,
    sendMessage,
    status,
    error,
    stop,
    setMessages,
    clearError,
  } = useChat({ transport });

  const [currentThreadId, setCurrentThreadId] = useState<string | null>(null);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);

  const threadsQuery = useQuery(
    trpc.chat.getManyThreads.queryOptions({ limit: 50 }),
  );
  const threads = threadsQuery.data?.threads ?? [];
  const refreshThreads = useCallback(() => {
    void threadsQuery.refetch();
  }, [threadsQuery]);

  // Refresh the thread list when a turn finishes so the AI-generated title (and
  // any newly-created thread) appears.
  const prevStatus = useRef(status);
  useEffect(() => {
    if (prevStatus.current === "streaming" && status === "ready") {
      void threadsQuery.refetch();
    }
    prevStatus.current = status;
  }, [status, threadsQuery]);

  const { mutateAsync: deleteThreadMutation } = useMutation(
    trpc.chat.deleteThread.mutationOptions({
      onSuccess: () => toast.success("Thread deleted"),
      onError: (e) => toast.error(`Failed to delete thread: ${e.message}`),
    }),
  );

  const send = useCallback(
    (text: string, override?: Partial<UseChatAgentConfig>) => {
      const threadId = currentThreadId ?? crypto.randomUUID();
      if (!currentThreadId) setCurrentThreadId(threadId);
      const cfg = { ...config, ...override };
      void sendMessage(
        { text },
        {
          body: {
            threadId,
            userRole,
            agent: cfg.agent ?? "chat",
            assetData: cfg.assetData,
            vulnerabilityData: cfg.vulnerabilityData,
          },
        },
      );
    },
    [currentThreadId, config, userRole, sendMessage],
  );

  const switchThread = useCallback(
    async (threadId: string) => {
      if (!threadId) {
        setCurrentThreadId(null);
        setMessages([]);
        return;
      }
      setCurrentThreadId(threadId);
      setIsLoadingHistory(true);
      try {
        const { messages: ui } = await queryClient.fetchQuery(
          trpc.chat.getUIMessages.queryOptions({ threadId }),
        );
        // biome-ignore lint/suspicious/noExplicitAny: server returns UIMessage-shaped rows
        setMessages(ui as any);
      } catch {
        // unknown thread — leave as-is
      } finally {
        setIsLoadingHistory(false);
      }
    },
    [queryClient, trpc.chat.getUIMessages, setMessages],
  );

  const newThread = useCallback(() => {
    setCurrentThreadId(null);
    setMessages([]);
  }, [setMessages]);

  const deleteThread = useCallback(
    async (threadId: string) => {
      await deleteThreadMutation({ threadId });
      if (threadId === currentThreadId) newThread();
      void threadsQuery.refetch();
    },
    [deleteThreadMutation, currentThreadId, newThread, threadsQuery],
  );

  return {
    messages,
    status,
    error,
    clearError,
    stop,
    send,
    threads,
    threadsLoading: threadsQuery.isLoading,
    threadsError: threadsQuery.error?.message ?? null,
    refreshThreads,
    currentThreadId,
    switchThread,
    newThread,
    deleteThread,
    isLoadingHistory,
  };
}

export type ViperChat = ReturnType<typeof useViperChat>;
