"use client";

import { useChat } from "@ai-sdk/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { DefaultChatTransport, getToolName, isToolUIPart } from "ai";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { useChatUI } from "@/features/chat/context/chat-panel-context";
import type { UseChatAgentConfig } from "@/features/chat/types";
import { useTRPC } from "@/trpc/client";

export function useViperChat(
  config?: UseChatAgentConfig,
  controlledThreadId?: string,
) {
  const { userRole } = useChatUI();
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  // Report routes remount the chat (via `key`) when the thread changes.
  const [currentThreadId, setCurrentThreadId] = useState<string | null>(
    () => controlledThreadId ?? null,
  );

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
  } = useChat({
    transport,
    onFinish: () => {
      // Refresh reports and lists, and expire history before a thread reopens.
      void queryClient.invalidateQueries(trpc.chat.pathFilter());
    },
  });

  const completedReportWrites = messages
    .flatMap((message) => message.parts)
    .filter(
      (part) =>
        isToolUIPart(part) &&
        getToolName(part) === "write_report" &&
        part.state === "output-available",
    ).length;
  useEffect(() => {
    if (completedReportWrites) {
      void queryClient.invalidateQueries(trpc.chat.pathFilter());
    }
  }, [completedReportWrites, queryClient, trpc.chat]);

  const [isLoadingHistory, setIsLoadingHistory] = useState(false);

  const threadsQuery = useQuery({
    ...trpc.chat.getManyThreads.queryOptions({ limit: 50 }),
    // The thread list/selector only renders in uncontrolled mode.
    enabled: !controlledThreadId,
  });
  const threads = threadsQuery.data?.threads ?? [];

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

  // Load the controlled thread's history when its id changes.
  // biome-ignore lint/correctness/useExhaustiveDependencies: switchThread is a stable useCallback
  useEffect(() => {
    if (controlledThreadId) void switchThread(controlledThreadId);
  }, [controlledThreadId]);

  const newThread = useCallback(() => {
    setCurrentThreadId(null);
    setMessages([]);
  }, [setMessages]);

  const deleteThread = useCallback(
    async (threadId: string) => {
      await deleteThreadMutation({ threadId });
      if (threadId === currentThreadId) newThread();
      void queryClient.invalidateQueries(trpc.chat.pathFilter());
    },
    [deleteThreadMutation, currentThreadId, newThread, queryClient, trpc.chat],
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
    currentThreadId,
    switchThread,
    newThread,
    deleteThread,
    isLoadingHistory,
  };
}

export type ViperChat = ReturnType<typeof useViperChat>;
