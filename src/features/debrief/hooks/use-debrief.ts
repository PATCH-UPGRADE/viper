"use client";

import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { useTRPC } from "@/trpc/client";

export const useSuspenseDebrief = () => {
  const trpc = useTRPC();
  return useSuspenseQuery(trpc.debrief.getForMyDepartment.queryOptions());
};

/** Queue a fresh debrief, then refetch so the card shows its pending state. */
export const useRegenerateDebrief = () => {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  return useMutation(
    trpc.debrief.regenerate.mutationOptions({
      onSuccess: () =>
        queryClient.invalidateQueries(
          trpc.debrief.getForMyDepartment.queryFilter(),
        ),
    }),
  );
};
