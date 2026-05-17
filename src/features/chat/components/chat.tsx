"use client";

import type { AnyToolCallPart } from "@inngest/use-agent";
import {
  type AgentError,
  AgentProvider,
  type AgentStatus,
  type DefaultHttpTransportConfig,
  type Thread,
} from "@inngest/use-agent";
import {
  AlertCircle,
  Bot,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Loader2,
  MessageSquarePlus,
  SendHorizontal,
  Trash2,
  Wrench,
  X,
} from "lucide-react";
import type React from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Markdown from "react-markdown";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Field,
  FieldContent,
  FieldLabel,
  FieldTitle,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { UserAvatar } from "@/components/user-avatar";
import { useChatUI } from "@/features/chat/context/chat-panel-context";
import { useSuggestedQuestions } from "@/features/chat/context/suggested-questions-context";
import { useChatAgent } from "@/features/chat/hooks/use-chat";
import type { UseChatAgentConfig } from "@/features/chat/types";
import { USER_ROLES, type UserRole } from "@/features/chat/utils";
import { authClient } from "@/lib/auth-client";
import { cn } from "@/lib/utils";

// https://agentkit.inngest.com/streaming/transport#sendmessageparams-options
export const TRANSPORT_CONFIG: Partial<DefaultHttpTransportConfig> = {
  api: {
    sendMessage: "/api/v1/chat",
    getRealtimeToken: "/api/v1/realtime/token",
    fetchThreads: "/api/v1/chat/threads",
    fetchHistory: "/api/v1/chat/threads/{threadId}",
    createThread: "/api/v1/chat/threads",
    deleteThread: "/api/v1/chat/threads/{threadId}",
    approveToolCall: "/api/v1/chat/approve-tool",
  },
};

interface AIChatProps {
  config?: UseChatAgentConfig;
}

export function AIChat({ config }: AIChatProps) {
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
      <ChatInner config={config} user={user} />
    </AgentProvider>
  );
}

interface ChatUser {
  name?: string | null;
  image?: string | null;
}

function EmptyState({
  isDisabled,
  onSend,
}: {
  isDisabled: boolean;
  onSend: (
    message: string,
    configOverride?: Partial<UseChatAgentConfig>,
  ) => void;
}) {
  const questions = useSuggestedQuestions();
  return (
    <div className="flex flex-col items-center justify-center h-full text-muted-foreground text-sm gap-2">
      <Bot className="size-8" />
      <p>Ask a question to get started.</p>
      {questions.length > 0 && (
        <div className="flex flex-wrap justify-center gap-2 mt-3 max-w-md">
          {questions.map((q) => (
            <button
              key={q.label}
              type="button"
              disabled={isDisabled}
              onClick={() => onSend(q.label, q.config)}
              className="rounded-full border bg-background px-3 py-1.5 text-xs text-foreground shadow-xs transition-colors hover:bg-accent hover:text-accent-foreground disabled:opacity-50"
            >
              {q.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function ChatMessageSkeleton({ align }: { align: "left" | "right" }) {
  return (
    <div
      className={cn(
        "flex items-end gap-2",
        align === "right" ? "justify-end" : "justify-start",
      )}
    >
      {align === "left" && (
        <Skeleton className="size-7 shrink-0 rounded-full" />
      )}
      <Skeleton
        className={cn(
          "h-10 rounded-2xl",
          align === "right" ? "w-48 rounded-br-sm" : "w-56 rounded-bl-sm",
        )}
      />
      {align === "right" && (
        <Skeleton className="size-7 shrink-0 rounded-full" />
      )}
    </div>
  );
}

function ChatMessagesSkeletonList() {
  const pattern: Array<"left" | "right"> = ["left", "right", "left", "right"];
  return (
    <div className="space-y-4">
      {pattern.map((align, i) => (
        <ChatMessageSkeleton key={i} align={align} />
      ))}
    </div>
  );
}

type ChatAgentMessage = ReturnType<typeof useChatAgent>["messages"][number];

interface AskUserQuestion {
  question: string;
  reason: string;
  suggested_answers: string[];
}

function ToolCallAccordion({ part }: { part: AnyToolCallPart }) {
  const [open, setOpen] = useState(false);
  const label = part.toolName.replace(/_/g, " ");
  const output =
    part.state === "output-available"
      ? ((part.output as { data?: string })?.data ?? "")
      : null;

  return (
    <Collapsible open={open} onOpenChange={setOpen} className="my-1">
      <CollapsibleTrigger className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground cursor-pointer">
        <Wrench className="size-3 shrink-0" />
        <span>{label}</span>
        <ChevronDown
          className={cn("size-3 transition-transform", open && "rotate-180")}
        />
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="mt-1 rounded-md bg-muted/50 p-2 text-xs font-mono whitespace-pre-wrap max-h-48 overflow-y-auto">
          {output ?? "Running..."}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

function SuggestedAnswers({
  answers,
  currentIndex,
  selected,
  onSelect,
}: {
  answers: string[];
  currentIndex: number;
  selected: string;
  onSelect: (value: string) => void;
}) {
  if (answers.length === 0) return null;
  return (
    <RadioGroup value={selected} onValueChange={onSelect} className="gap-2">
      {answers.map((ans) => (
        <FieldLabel key={ans} htmlFor={`q${currentIndex}-${ans}`}>
          <Field orientation="horizontal">
            <FieldContent>
              <FieldTitle>{ans}</FieldTitle>
            </FieldContent>
            <RadioGroupItem value={ans} id={`q${currentIndex}-${ans}`} />
          </Field>
        </FieldLabel>
      ))}
    </RadioGroup>
  );
}

function AskUserQuestionsMessage({
  part,
  isAnswered,
  onAnswer,
}: {
  part: AnyToolCallPart;
  isAnswered: boolean;
  onAnswer: (payload: string) => void;
}) {
  const questions =
    (part.input as { questions?: AskUserQuestion[] })?.questions ?? [];
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [currentIndex, setCurrentIndex] = useState(0);

  const allAnswered =
    questions.length > 0 &&
    questions.every((_, i) => (answers[i] ?? "").trim().length > 0);

  const handleSubmit = () => {
    // the actual message that gets sent to the chat
    const payload = JSON.stringify({
      answers: questions.map((q, i) => ({
        question: q.question,
        answer: answers[i] ?? "",
      })),
    });
    onAnswer(payload);
  };

  if (questions.length === 0) return null;

  const q = questions[currentIndex];

  const navChevrons = (
    <div className="flex items-center gap-1 shrink-0">
      <button
        type="button"
        onClick={() => setCurrentIndex((i) => Math.max(0, i - 1))}
        disabled={currentIndex === 0}
        className="rounded p-0.5 text-muted-foreground hover:text-foreground disabled:opacity-30 transition-colors"
      >
        <ChevronLeft className="h-4 w-4" />
      </button>
      <span className="text-xs text-muted-foreground tabular-nums">
        {currentIndex + 1} / {questions.length}
      </span>
      <button
        type="button"
        onClick={() =>
          setCurrentIndex((i) => Math.min(questions.length - 1, i + 1))
        }
        disabled={currentIndex === questions.length - 1}
        className="rounded p-0.5 text-muted-foreground hover:text-foreground disabled:opacity-30 transition-colors"
      >
        <ChevronRight className="h-4 w-4" />
      </button>
    </div>
  );

  return (
    <div className="space-y-3 mt-2">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-medium">{q.question}</p>
        {navChevrons}
      </div>
      <p className="text-xs text-muted-foreground italic">{q.reason}</p>
      {isAnswered ? (
        <p className="text-sm text-muted-foreground">
          {answers[currentIndex] ?? "—"}
        </p>
      ) : (
        <>
          <SuggestedAnswers
            answers={q.suggested_answers ?? []}
            currentIndex={currentIndex}
            selected={answers[currentIndex] ?? ""}
            onSelect={(value) =>
              setAnswers((prev) => ({ ...prev, [currentIndex]: value }))
            }
          />
          <Input
            placeholder="Write in response..."
            value={answers[currentIndex] ?? ""}
            onChange={(e) =>
              setAnswers((prev) => ({
                ...prev,
                [currentIndex]: e.target.value,
              }))
            }
            className="text-xs h-8"
          />
        </>
      )}
      {!isAnswered && (
        <Button
          size="sm"
          disabled={!allAnswered}
          onClick={handleSubmit}
          className="mt-1"
        >
          Send Answers
        </Button>
      )}
    </div>
  );
}

function AnswerSummary({
  answers,
}: {
  answers: { question: string; answer: string }[];
}) {
  return (
    <div className="space-y-1.5">
      {answers.map((a, i) => (
        <div key={i} className="text-sm">
          <span className="font-medium opacity-80">{a.question}</span>
          <br />
          <span>{a.answer}</span>
        </div>
      ))}
    </div>
  );
}

function ChatMessage({
  message,
  user,
  isLast,
  onAnswer,
}: {
  message: ChatAgentMessage;
  user: ChatUser | null;
  isLast: boolean;
  onAnswer: (payload: string) => void;
}) {
  const { role, parts } = message;

  const hasText = parts.some((p) => p.type === "text");

  return (
    <div
      className={cn(
        "flex items-end gap-2",
        role === "user" ? "justify-end" : "justify-start",
      )}
    >
      {role === "assistant" && (
        <Avatar className="size-7 shrink-0 self-start mt-1">
          <AvatarFallback className="bg-muted">
            <Bot className="size-4" />
          </AvatarFallback>
        </Avatar>
      )}

      <div
        className={cn(
          "max-w-[80%] text-sm",
          role === "user"
            ? "bg-primary text-primary-foreground rounded-2xl rounded-br-sm px-3 py-2"
            : hasText
              ? "bg-muted rounded-2xl rounded-bl-sm px-3 py-2"
              : "space-y-1",
        )}
      >
        {parts.map((part, idx) => {
          if (part.type === "text") {
            if (role === "user") {
              try {
                const parsed = JSON.parse(part.content);
                if (Array.isArray(parsed.answers)) {
                  return (
                    <AnswerSummary
                      key={`${part.id}-${idx}`}
                      answers={parsed.answers}
                    />
                  );
                }
              } catch {
                // not JSON — fall through to markdown
              }
            }
            return (
              <div key={`${part.id}-${idx}`} className="markdown">
                <Markdown>{part.content}</Markdown>
              </div>
            );
          }
          if (part.type === "tool-call") {
            if (part.toolName === "ask_user_questions") {
              return (
                <AskUserQuestionsMessage
                  key={part.toolCallId}
                  part={part}
                  isAnswered={!isLast}
                  onAnswer={onAnswer}
                />
              );
            }
            return <ToolCallAccordion key={part.toolCallId} part={part} />;
          }
          return null;
        })}
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
  isConnected,
  status,
  hasActiveQuestions,
}: {
  input: string;
  onInputChange: (value: string) => void;
  onSubmit: (e: React.FormEvent<HTMLFormElement>) => void;
  isDisabled: boolean;
  isConnected: boolean;
  status: AgentStatus;
  hasActiveQuestions: boolean;
}) {
  const { userRole, setUserRole } = useChatUI();

  const inputPlaceholder = (() => {
    switch (true) {
      case status === "error":
        return "An error has occurred...";
      case hasActiveQuestions:
        return "Please answer the questions above...";
      case isDisabled:
        return "AI is working...";
      default:
        return "Ask a question...";
    }
  })();

  return (
    <div className="border-t p-4">
      <form
        onSubmit={onSubmit}
        className={cn(
          "flex flex-col border-2 rounded-xl bg-background drop-shadow-accent drop-shadow-sm focus-within:drop-shadow-md focus-within:border-primary transition-colors",
          isDisabled ? "cursor-not-allowed" : "",
        )}
      >
        <input
          value={input}
          onChange={(e) => onInputChange(e.target.value)}
          placeholder={inputPlaceholder}
          disabled={isDisabled}
          className="flex-1 border-0 drop-shadow-none text-sm outline-0 selection:outline-0 focus:outline-0 p-2"
        />
        <div className="flex items-center justify-end gap-1.5 text-xs text-muted-foreground whitespace-nowrap p-1">
          <span>Ask as</span>
          <Select
            value={userRole}
            onValueChange={(v) => setUserRole(v as UserRole)}
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
      {!isConnected && (
        <p className="text-xs text-muted-foreground text-right mt-1">
          Status: Disconnected
        </p>
      )}
    </div>
  );
}

function ThreadSelector({
  currentThreadId,
  threads,
  threadsLoading,
  threadsHasMore,
  threadsError,
  loadMoreThreads,
  selectThread,
}: {
  currentThreadId: string | null;
  threads: Thread[];
  threadsError: string | null;
  threadsLoading: boolean;
  threadsHasMore: boolean;
  loadMoreThreads: () => void;
  selectThread: (threadId: string) => void;
}) {
  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    if (
      threadsHasMore &&
      !threadsLoading &&
      el.scrollTop + el.clientHeight >= el.scrollHeight - 50
    ) {
      loadMoreThreads();
    }
  };

  return (
    <Select
      value={currentThreadId ?? ""}
      onValueChange={(val) => {
        if (val) selectThread(val);
      }}
      disabled={threadsLoading && threads.length === 0}
    >
      <SelectTrigger className="w-[240px]">
        <SelectValue placeholder="New Chat" />
      </SelectTrigger>
      <SelectContent onScroll={handleScroll}>
        {threads.map((thread) => (
          <SelectItem key={thread.id} value={thread.id}>
            <span className="truncate max-w-[200px] block">{thread.title}</span>
          </SelectItem>
        ))}
        {threadsLoading && (
          <>
            <div className="px-2 py-1">
              <Skeleton className="h-8 rounded-md" />
            </div>
            <div className="px-2 py-1">
              <Skeleton className="h-8 rounded-md" />
            </div>
          </>
        )}
        {threadsError && <span className="text-red-500">{threadsError}</span>}
      </SelectContent>
    </Select>
  );
}

function ChatInner({
  config,
  user,
}: {
  config?: UseChatAgentConfig;
  user: ChatUser | null;
}) {
  const agent = useChatAgent(config);
  const {
    messages,
    sendMessage,
    sendMessageToThread,
    threads,
    currentThreadId,
    status,
    error,
    clearError,

    isConnected,
    isLoadingInitialThread,

    threadsLoading,
    threadsHasMore,
    threadsError,
    loadMoreThreads,
    deleteThread,
  } = agent;
  console.log("HEY", agent.messages);
  const { userRole } = useChatUI();
  const [input, setInput] = useState("");
  const [configOverride, setConfigOverride] =
    useState<Partial<UseChatAgentConfig>>();
  const scrollRef = useRef<HTMLDivElement>(null);

  const isAgentBusy = status !== "ready" || !isConnected;

  const hasActiveQuestions = useMemo(() => {
    if (status !== "ready") return false;
    const lastMsg = messages[messages.length - 1];
    if (!lastMsg || lastMsg.role !== "assistant") return false;
    return lastMsg.parts.some(
      (p) => p.type === "tool-call" && p.toolName === "ask_user_questions",
    );
  }, [messages, status]);

  const isDisabled = isAgentBusy || hasActiveQuestions;

  const sendWithOverride = useCallback(
    (message: string, override?: Partial<UseChatAgentConfig>) => {
      // Explicit override (e.g. suggested-question click) is sticky: persist it
      // so subsequent free-form messages also use it. Without this, React's
      // batched setState wouldn't reflect the change in time for this send.
      if (override && Object.keys(override).length > 0) {
        setConfigOverride(override);
      }
      const effective = override ?? configOverride;
      if (!effective || Object.keys(effective).length === 0) {
        return sendMessage(message);
      }
      // Priority chain: effective override > page-level config > userRole base.
      // Server (chat-agent.ts) defaults the agent when none is set.
      const stateOverride = {
        userRole,
        ...config,
        ...effective,
      };
      return sendMessageToThread(currentThreadId ?? "", message, {
        state: stateOverride,
      });
    },
    [
      sendMessage,
      sendMessageToThread,
      currentThreadId,
      config,
      configOverride,
      userRole,
    ],
  );

  // biome-ignore lint/correctness/useExhaustiveDependencies: set config override to none if thread changes
  useEffect(() => {
    setConfigOverride(undefined);
  }, [currentThreadId]);

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
    sendWithOverride(value);
  };

  return (
    <div className="flex flex-col h-full">
      <div className="bg-muted p-2 flex gap-2 justify-between">
        <ThreadSelector
          currentThreadId={currentThreadId}
          selectThread={agent.switchToThread}
          threads={threads}
          threadsError={threadsError}
          threadsLoading={threadsLoading}
          threadsHasMore={threadsHasMore}
          loadMoreThreads={loadMoreThreads}
        />
        <div>
          {currentThreadId && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    onClick={() => agent.switchToThread("")}
                  >
                    <MessageSquarePlus />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>New Chat</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    className="text-destructive hover:text-destructive"
                    onClick={async () => {
                      await deleteThread(currentThreadId);
                      agent.refreshThreads();
                    }}
                  >
                    <Trash2 />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Delete Thread</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {isLoadingInitialThread ? (
          <ChatMessagesSkeletonList />
        ) : (
          <>
            {messages.length === 0 && (
              <EmptyState isDisabled={isDisabled} onSend={sendWithOverride} />
            )}

            {messages.map((message, i) => (
              <ChatMessage
                key={message.id}
                message={message}
                user={user}
                isLast={i === messages.length - 1}
                onAnswer={(payload) => sendWithOverride(payload)}
              />
            ))}

            {(status === "submitted" || status === "streaming") && (
              <ChatStatusIndicator status={status} />
            )}
          </>
        )}

        <div ref={scrollRef} />
      </div>

      {status === "error" && error && (
        <ChatError error={error} onClear={clearError} />
      )}

      <ChatInputForm
        input={input}
        onInputChange={setInput}
        onSubmit={onSubmit}
        isDisabled={isDisabled}
        isConnected={isConnected}
        status={status}
        hasActiveQuestions={hasActiveQuestions}
      />
    </div>
  );
}
