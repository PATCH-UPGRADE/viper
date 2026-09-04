"use client";

import { useChat } from "@ai-sdk/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { DefaultChatTransport } from "ai";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { useChatUI } from "@/features/chat/context/chat-panel-context";
import type { UseChatAgentConfig } from "@/features/chat/types";
import { useTRPC } from "@/trpc/client";

export function useViperChat(
  config?: UseChatAgentConfig,
  controlled?: { threadId?: string; onTurnEnd?: () => void },
) {
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

  // A controlled caller (e.g. /reports) seeds the starting thread id and
  // remounts this hook (via `key`) when it changes — no need to sync it in.
  const [currentThreadId, setCurrentThreadId] = useState<string | null>(
    () => controlled?.threadId ?? null,
  );
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);

  const threadsQuery = useQuery({
    ...trpc.chat.getManyThreads.queryOptions({ limit: 50 }),
    // The thread list/selector only renders in uncontrolled mode.
    enabled: !controlled?.threadId,
  });
  const threads = threadsQuery.data?.threads ?? [];
  const refreshThreads = useCallback(() => {
    void threadsQuery.refetch();
  }, [threadsQuery]);

  // Refresh the thread list when a turn finishes so the AI-generated title (and
  // any newly-created thread) appears, and notify a controlled caller.
  const prevStatus = useRef(status);
  useEffect(() => {
    if (prevStatus.current === "streaming" && status === "ready") {
      void threadsQuery.refetch();
      controlled?.onTurnEnd?.();
    }
    prevStatus.current = status;
  }, [status, threadsQuery, controlled?.onTurnEnd]);

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
      // Clear immediately rather than after the fetch resolves — otherwise a
      // failed/unknown-thread fetch below leaves the PREVIOUS thread's
      // messages on screen under the new currentThreadId.
      setMessages([]);
      setIsLoadingHistory(true);
      try {
        const { messages: ui } = await queryClient.fetchQuery(
          trpc.chat.getUIMessages.queryOptions({ threadId }),
        );
        // biome-ignore lint/suspicious/noExplicitAny: server returns UIMessage-shaped rows
        setMessages(ui as any);
      } catch {
        // unknown thread — leave empty
      } finally {
        setIsLoadingHistory(false);
      }
    },
    [queryClient, trpc.chat.getUIMessages, setMessages],
  );

  // Load history for the controlled starting thread once on mount — the
  // caller remounts (via `key`) instead of changing controlled.threadId in place.
  // biome-ignore lint/correctness/useExhaustiveDependencies: mount-only, by design
  useEffect(() => {
    if (controlled?.threadId) void switchThread(controlled.threadId);
  }, []);

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
