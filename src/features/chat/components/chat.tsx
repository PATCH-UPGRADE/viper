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
            {visibleQuestions.length > 0 && (
              <div className="flex flex-wrap justify-center gap-2 mt-3 max-w-md">
                {visibleQuestions.map((q) => (
                  <button
                    key={q}
                    type="button"
                    disabled={isDisabled}
                    onClick={() => sendMessage(q)}
                    className="rounded-full border bg-background px-3 py-1.5 text-xs text-foreground shadow-xs transition-colors hover:bg-accent hover:text-accent-foreground disabled:opacity-50"
                  >
                    {q}
                  </button>
                ))}
              </div>
            )}
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
      <form onSubmit={onSubmit} className="border-t p-4 flex items-center gap-2">
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
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground whitespace-nowrap">
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
        </div>
      </form>
    </div>
  );
}
