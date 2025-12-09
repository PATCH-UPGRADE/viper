import { useTRPC } from "@/trpc/client";
import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { toast } from "sonner";

/**
 * Hook to update an asset
 */
// TODO: cassidy
export const useUpdateIssue = () => {
  const queryClient = useQueryClient();
  const trpc = useTRPC();

  return useMutation(
    trpc.assets.update.mutationOptions({
      onSuccess: (data) => {
        toast.success(`Asset "${data.role}" updated`);
        // Invalidate all getMany and getOne queries regardless of params
        queryClient.invalidateQueries({
          predicate: (query) => {
            const getManyKey = trpc.assets.getMany.queryKey();
            const getOneKey = trpc.assets.getOne.queryKey();
            return (
              query.queryKey[0] === getManyKey[0] ||
              query.queryKey[0] === getOneKey[0]
            );
          },
        });
      },
      onError: (error) => {
        toast.error(`Failed to update asset: ${error.message}`);
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
