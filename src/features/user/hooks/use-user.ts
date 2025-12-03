import { useTRPC } from "@/trpc/client";
import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { toast } from "sonner";
import { useApiTokenParams } from "./use-user-params";

export const useSuspenseApiTokens = () => {
  const trpc = useTRPC();
  const [params] = useApiTokenParams();

  return useSuspenseQuery(trpc.user.getManyApiTokens.queryOptions(params));
};

/**
 * Hook to create a new API token
 */
export const useCreateApiToken = () => {
  const queryClient = useQueryClient();
  const trpc = useTRPC();

  return useMutation(
    trpc.user.createApiToken.mutationOptions({
      onSuccess: (data) => {
        toast.success("API Token created");
        // Invalidate all getMany queries regardless of params (page, search, etc.)
        queryClient.invalidateQueries(
          trpc.user.getManyApiTokens.queryOptions({}),
        );
        return data;
      },
      onError: (error) => {
        toast.error(`Failed to create API token: ${error.message}`);
      },
    }),
  );
};

/**
 * Hook to remove an API token
 */
export const useRemoveApiToken = () => {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  return useMutation(
    trpc.user.removeApiToken.mutationOptions({
      onSuccess: (data) => {
        toast.success("API Token removed");
        // Invalidate all getMany and getOne queries regardless of params
        queryClient.invalidateQueries(
          trpc.user.getManyApiTokens.queryOptions({}),
        );
        return data;
      },
      onError: (error) => {
        toast.error(`Failed to remove API token: ${error.message}`);
      },
    }),
  );
};
