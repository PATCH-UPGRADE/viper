"use client";

import {
  AgentProvider,
  type DefaultHttpTransportConfig,
} from "@inngest/use-agent";
import { useState } from "react";
import { authClient } from "@/lib/auth-client";
import { useChatAgent } from "../hooks/use-chat";

const TRANSPORT_CONFIG: Partial<DefaultHttpTransportConfig> = {
  api: {
    sendMessage: "/api/v1/chat",
    getRealtimeToken: "/api/v1/realtime/token",
    fetchThreads: "/api/v1/threads",
    fetchHistory: "/api/v1/threads/{threadId}",
    createThread: "/api/v1/threads",
    deleteThread: "/api/v1/threads/{threadId}",
    approveToolCall: "/api/v1/approve-tool",
    cancelMessage: "/api/v1/chat/cancel",
  },
};

interface AIChatProps {
  systemPrompt?: string;
}

export function AIChat({ systemPrompt }: AIChatProps) {
  const { data: session } = authClient.useSession();
  const userId = session?.user?.id;

  if (!userId) {
    return <div>Please sign in to use AI Chat.</div>;
  }

  return (
    <AgentProvider userId={userId} transport={TRANSPORT_CONFIG}>
      <ChatInner systemPrompt={systemPrompt} />
    </AgentProvider>
  );
}

function ChatInner({ systemPrompt }: { systemPrompt?: string }) {
  const { messages, sendMessage, status } = useChatAgent({ systemPrompt });
  const [input, setInput] = useState("");

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const value = input.trim();
    if (!value || status !== "ready") return;
    setInput("");
    sendMessage(value);
  };

  return (
    <div>
      <ul>
        {messages.map(({ id, role, parts }) => (
          <li key={id}>
            <strong>{role}</strong>
            {parts.map((part) =>
              part.type === "text" ? (
                <div key={part.id}>{part.content}</div>
              ) : null,
            )}
          </li>
        ))}
      </ul>

      {status !== "ready" && <p>AI is thinking...</p>}

      <form onSubmit={onSubmit}>
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={status === "ready" ? "Ask a question..." : "Thinking..."}
          disabled={status !== "ready"}
        />
        <button type="submit" disabled={status !== "ready"}>
          Send
        </button>
      </form>
    </div>
  );
}
