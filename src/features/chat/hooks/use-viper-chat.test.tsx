import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { UIMessageChunk } from "ai";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useViperChat } from "./use-viper-chat";

const { history, trpc } = vi.hoisted(() => {
  const history = vi.fn();
  return {
    history,
    trpc: {
      chat: {
        pathFilter: () => ({ queryKey: ["chat"] }),
        getManyThreads: {
          queryOptions: () => ({
            queryKey: ["chat", "list"],
            queryFn: async () => ({ threads: [] }),
          }),
        },
        getUIMessages: {
          queryOptions: ({ threadId }: { threadId: string }) => ({
            queryKey: ["chat", "history", threadId],
            queryFn: history,
          }),
        },
        deleteThread: { mutationOptions: () => ({ mutationFn: vi.fn() }) },
      },
    },
  };
});
vi.mock("@/trpc/client", () => ({ useTRPC: () => trpc }));
vi.mock("@/features/chat/context/chat-panel-context", () => ({
  useChatUI: () => ({ userRole: "hospital administration" }),
}));

beforeEach(() => {
  vi.clearAllMocks();
  history.mockResolvedValue({ messages: [] });
});
afterEach(() => vi.unstubAllGlobals());

function setup() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: 30_000 } },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return {
    client,
    ...renderHook(() => useViperChat(undefined, "thread"), { wrapper }),
  };
}

describe("report conversation lifecycle", () => {
  it("refreshes once a report tool completes, before the assistant finishes", async () => {
    let controller!: ReadableStreamDefaultController<Uint8Array>;
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          new ReadableStream({
            start: (stream) => {
              controller = stream;
            },
          }),
          { headers: { "content-type": "text/event-stream" } },
        ),
      ),
    );
    const { result, client } = setup();
    await waitFor(() => expect(result.current.isLoadingHistory).toBe(false));
    const invalidate = vi.spyOn(client, "invalidateQueries");
    await act(async () => result.current.send("Write a report"));
    const emit = async (chunk: UIMessageChunk) => {
      await act(async () => {
        controller.enqueue(
          new TextEncoder().encode(`data: ${JSON.stringify(chunk)}\n\n`),
        );
      });
    };
    await emit({ type: "start", messageId: "assistant" });
    await emit({
      type: "tool-input-available",
      toolCallId: "write-1",
      toolName: "write_report",
      input: { markdown: "# Draft" },
    });
    expect(invalidate).not.toHaveBeenCalled();
    await emit({
      type: "tool-output-available",
      toolCallId: "write-1",
      output: "Report saved.",
    });
    await waitFor(() => expect(invalidate).toHaveBeenCalledTimes(1));
    expect(result.current.status).toBe("streaming");
    await emit({ type: "text-start", id: "reply" });
    await emit({ type: "text-delta", id: "reply", delta: "It is ready." });
    expect(invalidate).toHaveBeenCalledTimes(1);
    await emit({ type: "text-end", id: "reply" });
    await emit({ type: "finish" });
    await act(async () => controller.close());
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(invalidate).toHaveBeenCalledTimes(2);
    expect(
      client.getQueryState(["chat", "history", "thread"])?.isInvalidated,
    ).toBe(true);
    client.clear();
  });

  it("loads persisted history when a report is opened", async () => {
    history.mockResolvedValue({
      messages: [
        {
          id: "old",
          role: "assistant",
          parts: [{ type: "text", text: "Previous turn" }],
        },
      ],
    });
    const { result, client } = setup();
    await waitFor(() => expect(result.current.messages[0]?.id).toBe("old"));
    expect(result.current.currentThreadId).toBe("thread");
    expect(result.current.isLoadingHistory).toBe(false);
    client.clear();
  });
});
