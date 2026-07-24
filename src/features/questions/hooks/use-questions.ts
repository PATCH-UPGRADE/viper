"use client";

import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { toast } from "sonner";
import { useTRPC } from "@/trpc/client";

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
