"use client";

import {
  AgentProvider,
  type DefaultHttpTransportConfig,
} from "@inngest/use-agent";
import { AlertCircle, Bot, Loader2, SendHorizontal, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { UserAvatar } from "@/components/user-avatar";
import { authClient } from "@/lib/auth-client";
import { cn } from "@/lib/utils";
import { useChatAgent } from "../hooks/use-chat";

const TRANSPORT_CONFIG: Partial<DefaultHttpTransportConfig> = {
  api: {
    sendMessage: "/api/v1/chat",
    getRealtimeToken: "/api/v1/realtime/token",
    // TODO: these endpoints do not exist yet, there's no concept of persistent messages
    // (threads/conversations, history, database adapters)
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
  const user = session?.user ?? null;

  // technically "dead code" because this should only be used on protected routes
  if (!userId) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
        Please sign in to use AI Chat.
      </div>
    );
  }

  return (
    <AgentProvider userId={userId} transport={TRANSPORT_CONFIG}>
      <ChatInner systemPrompt={systemPrompt} user={user} />
    </AgentProvider>
  );
}

interface ChatUser {
  name?: string | null;
  image?: string | null;
}

function ChatInner({
  systemPrompt,
  user,
}: { systemPrompt?: string; user: ChatUser | null }) {
  const { messages, sendMessage, status, error, clearError } = useChatAgent({
    systemPrompt,
  });
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  const isDisabled = status !== "ready";

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (status === "error" && error) {
      console.error("[AI Chat Error]", error.message, error);
    }
  }, [status, error]);

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const value = input.trim();
    if (!value || isDisabled) return;
    setInput("");
    sendMessage(value);
  };

  return (
    <div className="flex flex-col h-full">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground text-sm gap-2">
            <Bot className="size-8" />
            <p>Ask a question to get started.</p>
          </div>
        )}

        {messages.map(({ id, role, parts }) => (
          <div
            key={id}
            className={cn(
              "flex items-end gap-2",
              role === "user" ? "justify-end" : "justify-start",
            )}
          >
            {role === "assistant" && (
              <Avatar className="size-7 shrink-0">
                <AvatarFallback className="bg-muted">
                  <Bot className="size-4" />
                </AvatarFallback>
              </Avatar>
            )}

            <div
              className={cn(
                "max-w-[80%] px-3 py-2 text-sm whitespace-pre-wrap",
                role === "user"
                  ? "bg-primary text-primary-foreground rounded-2xl rounded-br-sm"
                  : "bg-muted rounded-2xl rounded-bl-sm",
              )}
            >
              {parts.map((part) =>
                part.type === "text" ? (
                  <span key={part.id}>{part.content}</span>
                ) : null,
              )}
            </div>

            {role === "user" && (
              <UserAvatar user={user} className="size-7 shrink-0" />
            )}
          </div>
        ))}

        {status === "submitted" && (
          <div className="flex items-center gap-2 text-muted-foreground text-sm">
            <Avatar className="size-7 shrink-0">
              <AvatarFallback className="bg-muted">
                <Bot className="size-4" />
              </AvatarFallback>
            </Avatar>
            <div className="flex items-center gap-2 bg-muted rounded-2xl rounded-bl-sm px-3 py-2">
              <Loader2 className="size-3 animate-spin" />
              Sending...
            </div>
          </div>
        )}

        {status === "streaming" && (
          <div className="flex items-center gap-2 text-muted-foreground text-sm">
            <Avatar className="size-7 shrink-0">
              <AvatarFallback className="bg-muted">
                <Bot className="size-4" />
              </AvatarFallback>
            </Avatar>
            <div className="flex items-center gap-2 bg-muted rounded-2xl rounded-bl-sm px-3 py-2">
              <span className="flex gap-1">
                <span className="size-1.5 rounded-full bg-current animate-bounce [animation-delay:0ms]" />
                <span className="size-1.5 rounded-full bg-current animate-bounce [animation-delay:150ms]" />
                <span className="size-1.5 rounded-full bg-current animate-bounce [animation-delay:300ms]" />
              </span>
              AI is responding...
            </div>
          </div>
        )}

        <div ref={scrollRef} />
      </div>

      {/* Error */}
      {status === "error" && error && (
        <div className="px-4 pb-2">
          <Alert variant="destructive">
            <AlertCircle className="size-4" />
            <AlertDescription className="flex items-center justify-between gap-2">
              <span>
                {error.message}
                {error.suggestion && (
                  <span className="text-muted-foreground">
                    {" "}
                    — {error.suggestion}
                  </span>
                )}
              </span>
              <Button
                variant="ghost"
                size="icon"
                className="size-6 shrink-0"
                onClick={clearError}
              >
                <X className="size-3" />
              </Button>
            </AlertDescription>
          </Alert>
        </div>
      )}

      {/* Input */}
      <form onSubmit={onSubmit} className="border-t p-4 flex gap-2">
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={
            status === "error"
              ? "An error has occurred..."
              : isDisabled
                ? "AI is working..."
                : "Ask a question..."
          }
          disabled={isDisabled}
          className="flex-1"
        />
        <Button type="submit" size="icon" disabled={isDisabled || !input.trim()}>
          <SendHorizontal className="size-4" />
        </Button>
      </form>
    </div>
  );
}
