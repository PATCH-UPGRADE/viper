"use client";

import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { toast } from "sonner";
import { useTRPC } from "@/trpc/client";

export const useSuspenseMitigationPlans = (notificationId: string) => {
  const trpc = useTRPC();
  return useSuspenseQuery(
    trpc.mitigation.getForNotification.queryOptions({ notificationId }),
  );
};

export const useAcceptMitigationPlan = (notificationId: string) => {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  return useMutation(
    trpc.mitigation.accept.mutationOptions({
      onSuccess: (plan) => {
        queryClient.invalidateQueries(
          trpc.mitigation.getForNotification.queryFilter({ notificationId }),
        );
        // The plan's drafts just became real tickets — the tracking lists and
        // the notification detail both reflect that.
        queryClient.invalidateQueries(trpc.tracking.getMany.queryFilter());
        queryClient.invalidateQueries(
          trpc.notifications.getOne.queryFilter({ id: notificationId }),
        );
        const count = plan.workOrders.length;
        toast.success(`${count} work order${count === 1 ? "" : "s"} created`);
      },
      onError: (error) => {
        toast.error(`Failed to accept plan: ${error.message}`);
      },
    }),
  );
};
