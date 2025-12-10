import { useTRPC } from "@/trpc/client";
import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { toast } from "sonner";

/**
 * Hook to update an issue status
 */
export const useUpdateIssueStatus = () => {
  const queryClient = useQueryClient();
  const trpc = useTRPC();

  return useMutation(
    trpc.issues.updateStatus.mutationOptions({
      onSuccess: (data) => {
        toast.success(`Issue status updated`);
        queryClient.invalidateQueries(
          trpc.issues.getOne.queryFilter({ id: data.id }),
        );
      },
      onError: (error) => {
        toast.error(`Failed to update issue status: ${error.message}`);
      },
    }),
  );
};

/**
 * Hook to fetch a single asset using suspense
 */
export const useSuspenseIssue = (id: string) => {
  const trpc = useTRPC();
  return useSuspenseQuery(trpc.issues.getOne.queryOptions({ id }));
};
