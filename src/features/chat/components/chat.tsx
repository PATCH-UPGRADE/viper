"use client";

import {
  type AgentError,
  AgentProvider,
  type AgentStatus,
  type DefaultHttpTransportConfig,
} from "@inngest/use-agent";
import { AlertCircle, Bot, Loader2, SendHorizontal, X } from "lucide-react";
import type React from "react";
import { useEffect, useRef, useState } from "react";
import Markdown from "react-markdown";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { UserAvatar } from "@/components/user-avatar";
import { authClient } from "@/lib/auth-client";
import { cn } from "@/lib/utils";
import { useChatAgent } from "../hooks/use-chat";
import { USER_ROLES, type UserRole } from "../utils";

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
  suggestedQuestions?: Partial<Record<UserRole, string[]>>;
  userRole: UserRole;
  onUserRoleChange: (role: UserRole) => void;
}

export function AIChat({
  systemPrompt,
  suggestedQuestions,
  userRole,
  onUserRoleChange,
}: AIChatProps) {
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
      <ChatInner
        systemPrompt={systemPrompt}
        suggestedQuestions={suggestedQuestions}
        userRole={userRole}
        onUserRoleChange={onUserRoleChange}
        user={user}
      />
    </AgentProvider>
  );
}

interface ChatUser {
  name?: string | null;
  image?: string | null;
}

function EmptyState({
  questions,
  isDisabled,
  onSend,
}: {
  questions: string[];
  isDisabled: boolean;
  onSend: (message: string) => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center h-full text-muted-foreground text-sm gap-2">
      <Bot className="size-8" />
      <p>Ask a question to get started.</p>
      {questions.length > 0 && (
        <div className="flex flex-wrap justify-center gap-2 mt-3 max-w-md">
          {questions.map((q) => (
            <button
              key={q}
              type="button"
              disabled={isDisabled}
              onClick={() => onSend(q)}
              className="rounded-full border bg-background px-3 py-1.5 text-xs text-foreground shadow-xs transition-colors hover:bg-accent hover:text-accent-foreground disabled:opacity-50"
            >
              {q}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

type ChatAgentMessage = ReturnType<typeof useChatAgent>["messages"][number];

function ChatMessage({
  message,
  user,
}: {
  message: ChatAgentMessage;
  user: ChatUser | null;
}) {
  const { role, parts } = message;

  return (
    <div
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
          "markdown max-w-[80%] px-3 py-2 text-sm",
          role === "user"
            ? "bg-primary text-primary-foreground rounded-2xl rounded-br-sm"
            : "bg-muted rounded-2xl rounded-bl-sm",
        )}
      >
        {parts.map((part) =>
          part.type === "text" ? (
            <Markdown key={part.id}>{part.content}</Markdown>
          ) : null,
        )}
      </div>

      {role === "user" && (
        <UserAvatar user={user} className="size-7 shrink-0" />
      )}
    </div>
  );
}

function ChatStatusIndicator({
  status,
}: {
  status: "submitted" | "streaming";
}) {
  return (
    <div className="flex items-center gap-2 text-muted-foreground text-sm">
      <Avatar className="size-7 shrink-0">
        <AvatarFallback className="bg-muted">
          <Bot className="size-4" />
        </AvatarFallback>
      </Avatar>
      <div className="flex items-center gap-2 bg-muted rounded-2xl rounded-bl-sm px-3 py-2">
        {status === "submitted" ? (
          <>
            <Loader2 className="size-3 animate-spin" />
            Sending...
          </>
        ) : (
          <>
            <span className="flex gap-1">
              <span className="size-1.5 rounded-full bg-current animate-bounce [animation-delay:0ms]" />
              <span className="size-1.5 rounded-full bg-current animate-bounce [animation-delay:150ms]" />
              <span className="size-1.5 rounded-full bg-current animate-bounce [animation-delay:300ms]" />
            </span>
            AI is responding...
          </>
        )}
      </div>
    </div>
  );
}

function ChatError({
  error,
  onClear,
}: {
  error: AgentError;
  onClear: () => void;
}) {
  return (
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
            onClick={onClear}
          >
            <X className="size-3" />
          </Button>
        </AlertDescription>
      </Alert>
    </div>
  );
}

function ChatInputForm({
  input,
  onInputChange,
  onSubmit,
  isDisabled,
  status,
  userRole,
  onUserRoleChange,
}: {
  input: string;
  onInputChange: (value: string) => void;
  onSubmit: (e: React.FormEvent<HTMLFormElement>) => void;
  isDisabled: boolean;
  status: AgentStatus;
  userRole: UserRole;
  onUserRoleChange: (role: UserRole) => void;
}) {
  return (
    <div className="border-t p-4">
      <form
        onSubmit={onSubmit}
        className="flex flex-col border-2 rounded-xl bg-background drop-shadow-accent drop-shadow-sm focus-within:drop-shadow-md focus-within:border-primary transition-colors"
      >
        <input
          value={input}
          onChange={(e) => onInputChange(e.target.value)}
          placeholder={
            status === "error"
              ? "An error has occurred..."
              : isDisabled
                ? "AI is working..."
                : "Ask a question..."
          }
          disabled={isDisabled}
          className="flex-1 border-0 drop-shadow-none text-sm outline-0 selection:outline-0 focus:outline-0 p-2"
        />
        <div className="flex items-center justify-end gap-1.5 text-xs text-muted-foreground whitespace-nowrap p-1">
          <span>Ask as</span>
          <Select
            value={userRole}
            onValueChange={(v) => onUserRoleChange(v as UserRole)}
          >
            <SelectTrigger size="sm" className="h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {USER_ROLES.map((r) => (
                <SelectItem key={r} value={r}>
                  {r}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            type="submit"
            size="icon"
            disabled={isDisabled || !input.trim()}
          >
            <SendHorizontal className="size-4" />
          </Button>
        </div>
      </form>
    </div>
  );
}

function ChatInner({
  systemPrompt,
  suggestedQuestions,
  userRole,
  onUserRoleChange,
  user,
}: {
  systemPrompt?: string;
  suggestedQuestions?: Partial<Record<UserRole, string[]>>;
  userRole: UserRole;
  onUserRoleChange: (role: UserRole) => void;
  user: ChatUser | null;
}) {
  const { messages, sendMessage, status, error, clearError } = useChatAgent({
    systemPrompt,
  });
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  const isDisabled = status !== "ready";
  const visibleQuestions = suggestedQuestions?.[userRole] ?? [];

  // biome-ignore lint/correctness/useExhaustiveDependencies: want new messages to trigger scrolling
  useEffect(() => {
    if (messages.length)
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
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 && (
          <EmptyState
            questions={visibleQuestions}
            isDisabled={isDisabled}
            onSend={sendMessage}
          />
        )}

        {messages.map((message) => (
          <ChatMessage key={message.id} message={message} user={user} />
        ))}

        {(status === "submitted" || status === "streaming") && (
          <ChatStatusIndicator status={status} />
        )}

        {/*<div ref={scrollRef} className="hidden" />*/}
      </div>

      {status === "error" && error && (
        <ChatError error={error} onClear={clearError} />
      )}

      <ChatInputForm
        input={input}
        onInputChange={setInput}
        onSubmit={onSubmit}
        isDisabled={isDisabled}
        status={status}
        userRole={userRole}
        onUserRoleChange={onUserRoleChange}
      />
    </div>
  );
}
