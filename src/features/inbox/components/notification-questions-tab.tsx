"use client";

import { CheckCircle2, MessageSquareText } from "lucide-react";
import { QuestionCard } from "@/features/questions/components/question-card";
import { SuggestedEmailCard } from "@/features/questions/components/suggested-vendor-email-card";
import {
  useApproveEscalation,
  useDismissEscalation,
  useSuspenseQuestionsByNotificationId,
  useSuspenseSuggestedEmailsByNotificationId,
} from "@/features/questions/hooks/use-questions";

export function NotificationQuestionTab({
  notificationId,
}: {
  notificationId: string;
}) {
  const { data: questions } =
    useSuspenseQuestionsByNotificationId(notificationId);

  const { data: suggestedEmails } =
    useSuspenseSuggestedEmailsByNotificationId(notificationId);

  const approve = useApproveEscalation(notificationId);
  const dismiss = useDismissEscalation();

  const handleApprove = (email: any) => {
    approve.mutate({
      questionId: email.questionId,
      toEmails: email.toEmails,
      subject: email.subject,
      body: email.body,
    });
  };
  const handleDismiss = (questionId: string) => {
    dismiss(questionId);
  };

  const pending = questions.filter((q) => q.status === "PENDING");

  if (pending.length === 0 && suggestedEmails.length === 0) {
    if (questions.length === 0 && suggestedEmails.length === 0) {
      return (
        <p className="text-sm text-muted-foreground">
          No questions for this notification
        </p>
      );
    }
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <CheckCircle2 className="size-4" />
        <p>No open questions remaining</p>
      </div>
    );
  }

  const bannerText: string[] = [];
  if (pending.length > 0) {
    bannerText.push(
      `${pending.length} question${pending.length === 1 ? "" : "s"}`,
    );
  }
  if (suggestedEmails.length > 0) {
    bannerText.push(
      `${suggestedEmails.length} suggested vendor email${suggestedEmails.length === 1 ? "" : "s"}`,
    );
  }
  const fullText = bannerText.join(" and ");

  return (
    <div className="flex flex-col gap-4">
      {(pending.length > 0 || suggestedEmails.length > 0) && (
        <div className="flex items-start gap-2 rounded-md border bg-muted/50 p-4 text-sm rounded-xl border-orange-200/80 bg-orange-50/80 dark:border-orange-900/70 dark:bg-orange-950/40">
          <MessageSquareText className="size-4 mt-0.5 shrink-0 text-muted-foreground" />
          <p>
            <span className="font-semibold">
              {fullText} can sharpen this assessment.
            </span>{" "}
            <span className="text-sm text-muted-foreground">
              Answer what you know, or send a clarification request to the
              vendor. Each answer moves assets between risk tiers.
            </span>
          </p>
        </div>
      )}
      {pending.map((q) => (
        <QuestionCard key={q.id} question={q} />
      ))}
      {suggestedEmails.map((email) => (
        <SuggestedEmailCard
          key={email.questionId}
          email={email}
          isSending={approve.isPending}
          onApprove={() => handleApprove(email)}
          onDismiss={() => handleDismiss(email.questionId)}
        />
      ))}
    </div>
  );
}
