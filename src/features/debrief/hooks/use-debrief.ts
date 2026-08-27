"use client";

import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { toast } from "sonner";
import { DEBRIEF_POLL_INTERVAL_MS } from "@/config/constants";
import { useTRPC } from "@/trpc/client";

/**
 * How long to wait before refetching, or false to stop polling.
 *
 * A run finishes in Inngest, not in this tab, and nothing pushes the result
 * here. Without a poll the card keeps its skeleton and its disabled button
 * until the reader reloads. A finished debrief needs no further refetch.
 */
export const debriefPollInterval = (
  data: { status: string } | null | undefined,
): number | false =>
  data?.status === "Generating" ? DEBRIEF_POLL_INTERVAL_MS : false;

export const useSuspenseDebrief = () => {
  const trpc = useTRPC();
  return useSuspenseQuery({
    ...trpc.debrief.getForMyDepartment.queryOptions(),
    refetchInterval: (query) => debriefPollInterval(query.state.data),
  });
};

export const useRegenerateDebrief = () => {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  return useMutation(
    trpc.debrief.regenerate.mutationOptions({
      onSuccess: () =>
        queryClient.invalidateQueries(
          trpc.debrief.getForMyDepartment.queryFilter(),
        ),
      onError: (error) => {
        toast.error(`Failed to regenerate the debrief: ${error.message}`);
      },
    }),
  );
};
