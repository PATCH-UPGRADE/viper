"use client";

import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { toast } from "sonner";
import { useTRPC } from "@/trpc/client";
import { SuggestedVendorEmail } from "../types";

export function useSuspenseQuestionsByNotificationId(notificationId: string) {
  const trpc = useTRPC();
  return useSuspenseQuery(
    trpc.questions.getManyByNotificationId.queryOptions({
      notificationId,
    }),
  );
}

export function useSuspenseQuestionsByIssueId(issueId: string) {
  const trpc = useTRPC();
  return useSuspenseQuery(
    trpc.questions.getManyByIssueId.queryOptions({ issueId }),
  );
}

export function useRespondToQuestion() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  return useMutation(
    trpc.questions.respond.mutationOptions({
      onSuccess: (_data, variables) => {
        queryClient.invalidateQueries({
          queryKey: trpc.questions.getManyByNotificationId.queryKey(),
        });
        queryClient.invalidateQueries({
          queryKey: trpc.questions.getManyByIssueId.queryKey(),
        });
        queryClient.invalidateQueries({
          queryKey: trpc.issues.getOne.queryKey(),
        });
        if (variables.action === "answer") toast.success("Answer submitted");
      },
      onError: (error) =>
        toast.error(`Failed to respond to question: ${error.message}`),
    }),
  );
}

export function useSuspenseSuggestedEmailsByNotificationId(
  notificationId: string,
) {
  const trpc = useTRPC();
  return useSuspenseQuery(
    trpc.questions.getSuggestedEmailByNotificationId.queryOptions({
      notificationId,
    }),
  );
}

export function useApproveEscalation(notificationId: string) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  return useMutation(
    trpc.questions.approveEscalationEmail.mutationOptions({
      onSuccess: (_data, variables) => {
        toast.success("Email sent");
        const filter =
          trpc.questions.getSuggestedEmailByNotificationId.queryFilter({
            notificationId,
          });
        queryClient.setQueriesData<SuggestedVendorEmail[]>(
          filter,
          (emailList) => 
            emailList?.filter(
              (email) => email.questionId !== variables.questionId,
            )
        );
      },
      onError: (err) => toast.error(`Failed to send: ${err.message}`),
    }),
  );
}

export function useDismissEscalation() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  return (questionId: string) => {
    const filter =
      trpc.questions.getSuggestedEmailByNotificationId.queryFilter();
    queryClient.setQueriesData<SuggestedVendorEmail[]>(filter, (emailList) =>
      emailList?.filter((email) => email.questionId !== questionId),
    );
    toast.success("Dismissed email");
  };
}
