"use client";

import { useInngestSubscription } from "@inngest/realtime/hooks";
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

  const { mutateAsync: fetchRealtimeToken } = useMutation(
    trpc.chat.token.mutationOptions(),
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

  const { currentThreadId, replaceThreadMessages, refreshThreads } = agent;
  const loadedThreadRef = useRef<string | null>(null);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);

  // Subscribe to thread_updated events so AI-generated titles appear without
  // requiring a manual refresh. The server publishes after the first exchange
  // in src/inngest/functions/chat-agent.ts.
  const refreshTokenForTitle = useCallback(
    // biome-ignore lint/suspicious/noExplicitAny: token returned from getSubscriptionToken; structural shape matches what useInngestSubscription needs
    async (): Promise<any> => fetchRealtimeToken({}),
    [fetchRealtimeToken],
  );
  const { latestData: latestTitleUpdate } = useInngestSubscription({
    refreshToken: refreshTokenForTitle,
  });
  const lastSeenTitleSignatureRef = useRef<string | null>(null);
  useEffect(() => {
    if (!latestTitleUpdate) return;
    const msg = latestTitleUpdate as {
      topic?: string;
      data?: { threadId?: string; title?: string };
    };
    if (msg.topic !== "thread_updated") return;
    const threadId = msg.data?.threadId;
    const title = msg.data?.title;
    if (!threadId || !title) return;
    const sig = `${threadId}:${title}`;
    if (lastSeenTitleSignatureRef.current === sig) return;
    lastSeenTitleSignatureRef.current = sig;
    refreshThreads();
  }, [latestTitleUpdate, refreshThreads]);

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
        // Thread not yet in DB (brand-new thread created client-side via
        // createNewThread). Mark history as loaded with no messages so the
        // skeleton clears — without this, isLoadingInitialThread stays true.
        replaceThreadMessages(currentThreadId, []);
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
