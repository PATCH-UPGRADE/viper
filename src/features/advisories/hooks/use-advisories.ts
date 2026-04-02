"use client";

import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { toast } from "sonner";
import { useTRPC } from "@/trpc/client";
import { useAdvisoriesParams } from "./use-advisories-params";

/**
 * Hook to fetch all advisories using suspense
 */
export const useSuspenseAdvisories = () => {
  const trpc = useTRPC();
  const [params] = useAdvisoriesParams();
  return useSuspenseQuery(trpc.advisories.getMany.queryOptions(params));
};

/**
 * Hook to fetch a single advisory using suspense
 */
export const useSuspenseAdvisory = (id: string) => {
  const trpc = useTRPC();
  return useSuspenseQuery(trpc.advisories.getOne.queryOptions({ id }));
};

/**
 * Hook to update an advisory's status
 */
export const useUpdateAdvisoryStatus = () => {
  const queryClient = useQueryClient();
  const trpc = useTRPC();

  return useMutation(
    trpc.advisories.updateStatus.mutationOptions({
      onSuccess: (data) => {
        toast.success("Advisory status updated");
        queryClient.invalidateQueries(
          trpc.advisories.getOne.queryFilter({ id: data.id }),
        );
        queryClient.invalidateQueries(trpc.advisories.getMany.queryFilter());
      },
      onError: (error) => {
        toast.error(`Failed to update advisory status: ${error.message}`);
      },
    }),
  );
};
