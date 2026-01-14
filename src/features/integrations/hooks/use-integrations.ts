import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { toast } from "sonner";
import { useTRPC } from "@/trpc/client";
import { usePaginationParams } from "@/lib/pagination";
import type { ResourceType } from "@/generated/prisma";

export const useSuspenseIntegrations = (resourceType: ResourceType) => {
  const trpc = useTRPC();
  const [params] = usePaginationParams();
  // TODO: augment params to also include `asset`, right? for the `resourceType`

  return useSuspenseQuery(trpc.integrations.getManyIntegrations.queryOptions({...params, ...{resourceType}}));
};

/**
 * Hook to create a new API token
 */
/*export const useCreateIntegration = () => {
  const queryClient = useQueryClient();
  const trpc = useTRPC();

  return useMutation(
    trpc.integrations.createIntegration.mutationOptions({
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
};*/

/**
 * Hook to remove an API token

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
};*/
