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

  // Inngest's fetchHistory is broken, undocumented, and will not render tool
  // calls. We set history to [] here and just handle getting messages for
  // threads ourselves in a useEffect below.
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
  const freshThreadsRef = useRef<Set<string>>(new Set());
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);

  // Threads created client side don't exist in the db yet until messages get
  // saved. Set `loadedThreadRef` so we skip a call to the db to get those
  // threads' messages -- see the useEffect hook below this.
  const createNewThread = useCallback((): string => {
    const id = agent.createNewThread();
    freshThreadsRef.current.add(id);
    loadedThreadRef.current = id;
    replaceThreadMessages(id, []);
    return id;
  }, [agent, replaceThreadMessages]);

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

  /* Use the getHistory trpc endpoint to get messages from the user
   * use `buildConversationMessages` + `replaceThreadMessages to structure
   * these for Inngest.
   * If we're looking at a thread that was just created, skip the db call
   * since that thread doesn't live in the db yet. */
  useEffect(() => {
    if (!currentThreadId || loadedThreadRef.current === currentThreadId) return;
    // Threads created client-side via the wrapped createNewThread above don't
    // yet have a DB row; skip the fetch
    if (freshThreadsRef.current.has(currentThreadId)) {
      loadedThreadRef.current = currentThreadId;
      return;
    }
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
        // Unknown thread? Leave messages untouched.
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

  return { ...agent, createNewThread, isLoadingHistory };
}
