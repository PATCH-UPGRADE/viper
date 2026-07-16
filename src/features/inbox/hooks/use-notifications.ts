"use client";

import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { toast } from "sonner";
import { useTRPC } from "@/trpc/client";
import type { AffectedAssetsSummary } from "../types";
import { useNotificationsParams } from "./use-notifications-params";

export const useSuspenseNotifications = () => {
  const trpc = useTRPC();
  const [params] = useNotificationsParams();
  return useSuspenseQuery(trpc.notifications.getMany.queryOptions(params));
};

export const useSuspenseNotification = (id: string) => {
  const trpc = useTRPC();
  return useSuspenseQuery(trpc.notifications.getOne.queryOptions({ id }));
};

/** Paginated asset rows for one (matching, bucket) on the affected-assets tab. */
export const useAffectedAssetsPage = (args: {
  notificationId: string;
  matchingId: string;
  bucket: keyof AffectedAssetsSummary;
  page: number;
  pageSize: number;
}) => {
  const trpc = useTRPC();
  return useQuery({
    ...trpc.notifications.getAffectedAssetsPage.queryOptions(args),
    placeholderData: keepPreviousData,
  });
};

export const useMarkNotificationRead = () => {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  return useMutation(
    trpc.notifications.markRead.mutationOptions({
      onSuccess: (_data, variables) => {
        queryClient.invalidateQueries(trpc.notifications.getMany.queryFilter());
        queryClient.invalidateQueries(
          trpc.notifications.getOne.queryFilter({
            id: variables.notificationId,
          }),
        );
      },
    }),
  );
};

export const useMarkMatchIncorrect = () => {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  return useMutation(
    trpc.notifications.markMatchIncorrect.mutationOptions({
      onSuccess: (_data, variables) => {
        queryClient.invalidateQueries(trpc.notifications.getMany.queryFilter());
        queryClient.invalidateQueries(
          trpc.notifications.getOne.queryFilter({
            id: variables.notificationId,
          }),
        );
      },
      onError: (error) => {
        toast.error(`Failed to unlink match: ${error.message}`);
      },
    }),
  );
};
