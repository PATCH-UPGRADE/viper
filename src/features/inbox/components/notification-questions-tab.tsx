"use client";

import { CheckCircle2, MessageSquareText } from "lucide-react";
import { QuestionCard } from "@/features/questions/components/question-card";
import { useSuspenseQuestionsByNotificationId } from "@/features/questions/hooks/use-questions";
import { groupQuestionChains } from "@/features/questions/types";

export function NotificationQuestionTab({
  notificationId,
}: {
  notificationId: string;
}) {
  const { data: questions } =
    useSuspenseQuestionsByNotificationId(notificationId);

  if (questions.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No questions for this notification
      </p>
    );
  }

  const pending = questions.filter((q) => q.status === "PENDING");

  if (pending.length === 0) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <CheckCircle2 className="size-4" />
        <p>No open questions remaining</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {pending.length > 0 && (
        <div className="flex items-start gap-2 rounded-md border bg-muted/50 p-4 text-sm rounded-xl border-orange-200/80 bg-orange-50/80 dark:border-orange-900/70 dark:bg-orange-950/40">
          <MessageSquareText className="size-4 mt-0.5 shrink-0 text-muted-foreground" />
          <p>
            <span className="font-semibold">
              {pending.length} question{pending.length === 1 ? "" : "s"} can
              sharpen this assessment.
            </span>{" "}
            <span className="text-sm text-muted-foreground">
              Answer what you know, or send a clarification requst to the
              vendor. Each answer moves assets between risk tiers.
            </span>
          </p>
        </div>
      )}
      {pending.map((q) => (
        <QuestionCard key={q.id} question={q} />
      ))}
    </div>
  );
}
