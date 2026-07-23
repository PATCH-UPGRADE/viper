"use client";

import {
  AlertCircle,
  Bot,
  Brain,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  Fullscreen,
  Loader2,
  MessageSquarePlus,
  Minimize2,
  SendHorizontal,
  Trash2,
  Wrench,
  X,
} from "lucide-react";
import type React from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Field,
  FieldContent,
  FieldLabel,
  FieldTitle,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { MarkdownWithTablesWrapper } from "@/components/ui/markdown-with-tables-wrapper";
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
import {
  useViperChat,
  type ViperChat,
} from "@/features/chat/hooks/use-viper-chat";
import {
  type FleetWorkOrderProposal,
  parseFleetProposal,
  type UseChatAgentConfig,
} from "@/features/chat/types";
import { USER_ROLES, type UserRole } from "@/features/chat/utils";
import {
  useAcceptFleetWorkOrder,
  useFleetProposalStatus,
} from "@/features/tracking/hooks/use-tracking";
import { authClient } from "@/lib/auth-client";
import { MONTHS_SHORT } from "@/lib/date-utils";
import { cn } from "@/lib/utils";

interface AIChatProps {
  config?: UseChatAgentConfig;
}

export function AIChat({ config }: AIChatProps) {
  const { data: session } = authClient.useSession();
  const user = session?.user ?? null;

  // technically "dead code" because this should only be used on protected routes
  if (!session?.user?.id) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
        Please sign in to use AI Chat.
      </div>
    );
  }

  return <ChatInner config={config} user={user} />;
}

// ─── Message part helpers (AI SDK UIMessage parts) ────────────────────────────

type ChatAgentMessage = ViperChat["messages"][number];
type MessagePart = ChatAgentMessage["parts"][number];

interface ToolPart {
  type: string;
  toolName?: string;
  toolCallId: string;
  state?: string;
  input?: unknown;
  output?: unknown;
}

function isToolPart(part: MessagePart): part is MessagePart & ToolPart {
  return part.type === "dynamic-tool" || part.type.startsWith("tool-");
}

function toolName(part: ToolPart): string {
  return part.toolName ?? part.type.replace(/^tool-/, "");
}

interface ChatUser {
  name?: string | null;
  image?: string | null;
}

interface AskUserQuestion {
  question: string;
  reason: string;
  suggested_answers: string[];
}

// ─── Presentational pieces ───────────────────────────

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

function ReasoningBlock({
  text,
  streaming,
}: {
  text: string;
  streaming: boolean;
}) {
  const [open, setOpen] = useState(false);
  // Auto-expand while the model is actively thinking; let the user collapse after.
  useEffect(() => {
    if (streaming) setOpen(true);
  }, [streaming]);

  if (!text) return null;
  return (
    <Collapsible open={open} onOpenChange={setOpen} className="my-1">
      <CollapsibleTrigger className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground cursor-pointer">
        <Brain className="size-3 shrink-0" />
        <span>{streaming ? "Thinking…" : "Thought process"}</span>
        <ChevronDown
          className={cn("size-3 transition-transform", open && "rotate-180")}
        />
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="mt-1 rounded-md border-l-2 border-muted bg-muted/30 p-2 text-xs text-muted-foreground whitespace-pre-wrap max-h-60 overflow-y-auto">
          {text}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

function ToolCallAccordion({ part }: { part: ToolPart }) {
  const [open, setOpen] = useState(false);
  const label = toolName(part).replace(/_/g, " ");
  const hasOutput = part.state === "output-available";
  const output = hasOutput
    ? typeof part.output === "string"
      ? part.output
      : JSON.stringify(part.output, null, 2)
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
      {answers.map((ans) => {
        const ansSlug = ans.replace(/\s+/g, "-").replace(/[^a-zA-Z0-9_-]/g, "");
        return (
          <FieldLabel key={ans} htmlFor={`q${currentIndex}-${ansSlug}`}>
            <Field orientation="horizontal">
              <FieldContent>
                <FieldTitle>{ans}</FieldTitle>
              </FieldContent>
              <RadioGroupItem value={ans} id={`q${currentIndex}-${ansSlug}`} />
            </Field>
          </FieldLabel>
        );
      })}
    </RadioGroup>
  );
}

function AskUserQuestionsMessage({
  part,
  isAnswered,
  onAnswer,
}: {
  part: ToolPart;
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
        aria-label="Previous question"
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
        aria-label="Next question"
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

/**
 * Format a proposed service window from the wall-clock parts of its ISO string,
 * with no timezone conversion. `Date#toLocaleString()` with no arguments uses
 * the runtime's locale and timezone, which differ between the server render and
 * the browser and produce a hydration mismatch; parsing the parts directly
 * yields identical text on both, and preserves the local time the user approved.
 */
function formatScheduledWindow(iso: string): string {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  if (!m) return iso;
  const [, year, month, day, hour, minute] = m;
  const monthName = MONTHS_SHORT[Number(month) - 1] ?? month;
  return `${monthName} ${Number(day)}, ${year}, ${hour}:${minute}`;
}

/**
 * Approval card for a Siemens Healthineers Fleet work order the agent proposed.
 * Nothing has been created upstream at this point — Accept is what files it.
 * Rendered from the tool's OUTPUT (not its input) so a card can only appear for
 * a proposal that passed the Siemens-managed check server-side.
 */
function FleetWorkOrderProposalCard({
  proposal,
  toolCallId,
}: {
  proposal: FleetWorkOrderProposal;
  toolCallId: string;
}) {
  const { data: status, isLoading } = useFleetProposalStatus(toolCallId);
  const accept = useAcceptFleetWorkOrder();
  const [dismissed, setDismissed] = useState(false);

  const accepted = Boolean(status);
  const scheduledLabel = proposal.scheduledAt
    ? formatScheduledWindow(proposal.scheduledAt)
    : "Not specified";

  return (
    <div className="mt-2 space-y-3 rounded-lg border bg-background p-3">
      <div className="flex items-start gap-2">
        <ClipboardCheck className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
        <div className="space-y-0.5">
          <p className="text-sm font-medium">{proposal.summary}</p>
          <p className="text-xs text-muted-foreground">
            Proposed work order · Siemens Healthineers teamplay Fleet
          </p>
        </div>
      </div>

      <dl className="space-y-1 text-xs">
        <div className="flex gap-2">
          <dt className="w-24 shrink-0 text-muted-foreground">Assets</dt>
          <dd>
            {proposal.assets
              .map((a) => `${a.hostname ?? a.assetId} (${a.equipmentKey})`)
              .join(", ")}
          </dd>
        </div>
        <div className="flex gap-2">
          <dt className="w-24 shrink-0 text-muted-foreground">Category</dt>
          <dd>{proposal.category.replace(/_/g, " ").toLowerCase()}</dd>
        </div>
        <div className="flex gap-2">
          <dt className="w-24 shrink-0 text-muted-foreground">Support</dt>
          <dd className="capitalize">{proposal.supportType} support</dd>
        </div>
        <div className="flex gap-2">
          <dt className="w-24 shrink-0 text-muted-foreground">System</dt>
          <dd
            className={
              proposal.operationalStatus === "not_operational"
                ? "font-medium text-destructive"
                : ""
            }
          >
            {proposal.operationalStatus === "not_operational"
              ? "Not operational"
              : "Partially operational"}
          </dd>
        </div>
        <div className="flex gap-2">
          <dt className="w-24 shrink-0 text-muted-foreground">Patient risk</dt>
          <dd
            className={
              proposal.dangerForPatient === "yes"
                ? "font-medium text-destructive"
                : ""
            }
          >
            {proposal.dangerForPatient === "yes"
              ? "Yes — patient-safety risk"
              : proposal.dangerForPatient === "unknown"
                ? "Unknown"
                : "No"}
          </dd>
        </div>
        <div className="flex gap-2">
          <dt className="w-24 shrink-0 text-muted-foreground">Overtime</dt>
          <dd>
            {proposal.overtimeAuthorized ? "Authorized" : "Not authorized"}
          </dd>
        </div>
        <div className="flex gap-2">
          <dt className="w-24 shrink-0 text-muted-foreground">Window</dt>
          <dd>{scheduledLabel}</dd>
        </div>
      </dl>

      <p className="text-xs whitespace-pre-wrap">{proposal.description}</p>
      {proposal.rationale && (
        <div className="flex items-start gap-1.5 text-xs italic text-muted-foreground">
          <Bot
            className="mt-0.5 size-3.5 shrink-0"
            aria-label="CDST rationale"
          />
          <p>{proposal.rationale}</p>
        </div>
      )}

      {proposal.dangerForPatient === "yes" && !accepted ? (
        // Fleet requires patient-safety issues to be phoned in, not filed
        // online — so there's no Accept here (see the mutation's matching guard).
        <div className="rounded-md border border-destructive/50 bg-destructive/10 p-2 text-xs">
          <p className="font-medium text-destructive">
            Patient-safety risk — call Siemens
          </p>
          <p className="text-muted-foreground">
            teamplay Fleet doesn't accept online tickets for patient-safety
            issues. Contact Siemens Healthineers by phone to report this — it
            can't be filed from here.
          </p>
        </div>
      ) : accepted ? (
        <p className="text-xs font-medium text-muted-foreground">
          Accepted · Fleet {status?.externalIds.join(", ")}
        </p>
      ) : dismissed ? (
        <p className="text-xs text-muted-foreground">
          Dismissed — no work order was created.
        </p>
      ) : (
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            disabled={accept.isPending || isLoading}
            onClick={() =>
              accept.mutate({
                toolCallId,
                assetIds: proposal.assets.map((a) => a.assetId),
                summary: proposal.summary,
                description: proposal.description,
                category: proposal.category,
                supportType: proposal.supportType,
                operationalStatus: proposal.operationalStatus,
                dangerForPatient: proposal.dangerForPatient,
                overtimeAuthorized: proposal.overtimeAuthorized,
                scheduledAt: proposal.scheduledAt,
              })
            }
          >
            {accept.isPending ? (
              <>
                <Loader2 className="size-3 animate-spin" /> Sending…
              </>
            ) : (
              "Accept"
            )}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={accept.isPending}
            onClick={() => setDismissed(true)}
          >
            Dismiss
          </Button>
          <span className="text-xs text-muted-foreground">
            {proposal.assets.length > 1
              ? `Files ${proposal.assets.length} work orders on Fleet`
              : "Files a work order on Fleet"}
          </span>
        </div>
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
  streaming,
  onAnswer,
}: {
  message: ChatAgentMessage;
  user: ChatUser | null;
  isLast: boolean;
  streaming: boolean;
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
          "max-w-[80%] text-sm overflow-x-auto",
          role === "user"
            ? "bg-primary text-primary-foreground rounded-2xl rounded-br-sm px-3 py-2"
            : hasText
              ? "bg-muted rounded-2xl rounded-bl-sm px-3 py-2"
              : "space-y-1",
        )}
      >
        {parts.map((part, idx) => {
          const key = `${message.id}-${idx}`;

          if (part.type === "reasoning") {
            return (
              <ReasoningBlock
                key={key}
                text={part.text}
                streaming={streaming && isLast}
              />
            );
          }

          if (part.type === "text") {
            if (role === "user") {
              try {
                const parsed = JSON.parse(part.text);
                if (Array.isArray(parsed.answers)) {
                  return <AnswerSummary key={key} answers={parsed.answers} />;
                }
              } catch {
                // not JSON — fall through to markdown
              }
            }
            return (
              <MarkdownWithTablesWrapper key={key}>
                {part.text}
              </MarkdownWithTablesWrapper>
            );
          }

          if (isToolPart(part)) {
            if (toolName(part) === "ask_user_questions") {
              return (
                <AskUserQuestionsMessage
                  key={part.toolCallId}
                  part={part}
                  isAnswered={!isLast}
                  onAnswer={onAnswer}
                />
              );
            }
            if (toolName(part) === "propose_fleet_work_order") {
              // Only a validated proposal parses; a refusal (or a still-streaming
              // call) falls through to the accordion, which shows the reason.
              const proposal = parseFleetProposal(part.output);
              if (proposal) {
                return (
                  <FleetWorkOrderProposalCard
                    key={part.toolCallId}
                    proposal={proposal}
                    toolCallId={part.toolCallId}
                  />
                );
              }
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

function ChatError({ error, onClear }: { error: Error; onClear: () => void }) {
  return (
    <div className="px-4 pb-2">
      <Alert variant="destructive">
        <AlertCircle className="size-4" />
        <AlertDescription className="flex items-center justify-between gap-2">
          <span>{error.message}</span>
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
  hasActiveQuestions,
}: {
  input: string;
  onInputChange: (value: string) => void;
  onSubmit: (e: React.FormEvent<HTMLFormElement>) => void;
  isDisabled: boolean;
  status: "submitted" | "streaming" | "ready" | "error";
  hasActiveQuestions: boolean;
}) {
  const { userRole, setUserRole } = useChatUI();
  const formRef = useRef<HTMLFormElement>(null);

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
        ref={formRef}
        onSubmit={onSubmit}
        className={cn(
          "flex flex-col border-2 rounded-xl bg-background drop-shadow-accent drop-shadow-sm focus-within:drop-shadow-md focus-within:border-primary transition-colors",
          isDisabled ? "cursor-not-allowed" : "",
        )}
      >
        <textarea
          value={input}
          onChange={(e) => onInputChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              formRef.current?.requestSubmit();
            }
          }}
          rows={1}
          placeholder={inputPlaceholder}
          disabled={isDisabled}
          className="w-full resize-none border-0 drop-shadow-none text-sm outline-0 selection:bg-primary/25 focus:outline-0 p-2 overflow-y-auto max-h-32 field-sizing-content"
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
    </div>
  );
}

interface ThreadListItem {
  id: string;
  title: string | null;
}

function ThreadSelector({
  currentThreadId,
  threads,
  threadsLoading,
  threadsError,
  selectThread,
}: {
  currentThreadId: string | null;
  threads: ThreadListItem[];
  threadsError: string | null;
  threadsLoading: boolean;
  selectThread: (threadId: string) => void;
}) {
  const currentTitle =
    threads.find((t) => t.id === currentThreadId)?.title ?? null;
  const currentThreadExists = threads?.some((t) => t.id === currentThreadId);

  const [displayedTitle, setDisplayedTitle] = useState<string | null>(null);
  const [isAnimating, setIsAnimating] = useState(false);

  // animate the title as it comes in with type-writer effect
  useEffect(() => {
    if (!currentTitle) {
      setDisplayedTitle(null);
      setIsAnimating(false);
      return;
    }
    setDisplayedTitle("");
    setIsAnimating(true);
    let i = 0;
    const id = setInterval(() => {
      i++;
      setDisplayedTitle(currentTitle.slice(0, i));
      if (i >= currentTitle.length) {
        clearInterval(id);
        setIsAnimating(false);
      }
    }, 40);
    return () => clearInterval(id);
  }, [currentTitle]);

  return (
    <Select
      key={`${currentThreadId ?? "none"}:${currentTitle ?? ""}`}
      value={currentThreadExists ? currentThreadId || "" : ""}
      onValueChange={(val) => {
        if (val) selectThread(val);
      }}
      disabled={threadsLoading && threads.length === 0}
    >
      <SelectTrigger className="w-[240px]">
        <SelectValue placeholder="New Chat">
          {displayedTitle !== null ? (
            <span className="truncate max-w-[200px] block">
              {displayedTitle}
              {isAnimating ? "▌" : ""}
            </span>
          ) : undefined}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {threads.map((thread) => (
          <SelectItem key={thread.id} value={thread.id}>
            <span className="truncate max-w-[200px] block">
              {thread.title || "New Chat"}
            </span>
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
  const {
    messages,
    status,
    error,
    clearError,
    send,
    threads,
    threadsLoading,
    threadsError,
    currentThreadId,
    switchThread,
    newThread,
    deleteThread,
    refreshThreads,
    isLoadingHistory,
  } = useViperChat(config);

  const [input, setInput] = useState("");
  const [configOverride, setConfigOverride] =
    useState<Partial<UseChatAgentConfig>>();
  const [isFullscreen, setIsFullscreen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const isAgentBusy = status === "submitted" || status === "streaming";

  const hasActiveQuestions = useMemo(() => {
    if (status !== "ready") return false;
    const lastMsg = messages[messages.length - 1];
    if (!lastMsg || lastMsg.role !== "assistant") return false;
    return lastMsg.parts.some(
      (p) =>
        (p.type === "dynamic-tool" || p.type.startsWith("tool-")) &&
        ((p as ToolPart).toolName ?? p.type.replace(/^tool-/, "")) ===
          "ask_user_questions",
    );
  }, [messages, status]);

  const isDisabled = isAgentBusy || hasActiveQuestions;

  const sendWithOverride = useCallback(
    (message: string, override?: Partial<UseChatAgentConfig>) => {
      // Explicit override (e.g. suggested-question click) is sticky.
      if (override && Object.keys(override).length > 0) {
        setConfigOverride(override);
      }
      send(message, override ?? configOverride);
    },
    [send, configOverride],
  );

  // biome-ignore lint/correctness/useExhaustiveDependencies: reset config override when thread changes
  useEffect(() => {
    setConfigOverride(undefined);
  }, [currentThreadId]);

  useEffect(() => {
    const el = containerRef.current;
    if (messages.length && el)
      el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
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

  const chatContent = (
    <div className="flex flex-col h-full">
      <div className="bg-muted p-2 flex gap-2 justify-between">
        <ThreadSelector
          currentThreadId={currentThreadId}
          selectThread={switchThread}
          threads={threads}
          threadsError={threadsError}
          threadsLoading={threadsLoading}
        />
        <div>
          <TooltipProvider>
            {isFullscreen ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    onClick={() => setIsFullscreen(false)}
                  >
                    <Minimize2 />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Exit fullscreen</TooltipContent>
              </Tooltip>
            ) : (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" onClick={() => setIsFullscreen(true)}>
                    <Fullscreen />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Fullscreen</TooltipContent>
              </Tooltip>
            )}

            {currentThreadId && (
              <>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="ghost" onClick={() => newThread()}>
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
                        refreshThreads();
                      }}
                    >
                      <Trash2 />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Delete Thread</TooltipContent>
                </Tooltip>
              </>
            )}
          </TooltipProvider>
        </div>
      </div>
      <div ref={containerRef} className="flex-1 overflow-y-auto p-4 space-y-4">
        {isLoadingHistory ? (
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
                streaming={status === "streaming"}
                onAnswer={(payload) => sendWithOverride(payload)}
              />
            ))}

            {(status === "submitted" || status === "streaming") && (
              <ChatStatusIndicator status={status} />
            )}
          </>
        )}
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
        hasActiveQuestions={hasActiveQuestions}
      />
    </div>
  );

  return (
    <>
      {/* handle pop-out by conditionally rendering the SAME chat box in one of two places */}
      {isFullscreen ? (
        <div className="flex flex-col items-center justify-center h-full text-muted-foreground text-sm gap-2">
          <Fullscreen className="size-8" />
          AI Chat is currently fullscreened.
        </div>
      ) : (
        chatContent
      )}

      <Dialog open={isFullscreen} onOpenChange={setIsFullscreen}>
        {/* hide DialogContent close button (keep ESC functionality) and let Minimize button do it */}
        <DialogContent className="min-w-1/2 w-full h-full flex flex-col p-0 gap-0 [&>button:last-child]:hidden">
          <DialogTitle className="sr-only">AI Chat</DialogTitle>
          <DialogDescription className="sr-only">
            Fullscreened AI Chat window
          </DialogDescription>
          {chatContent}
        </DialogContent>
      </Dialog>
    </>
  );
}
