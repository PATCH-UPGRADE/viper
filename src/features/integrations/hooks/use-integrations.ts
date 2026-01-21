import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { toast } from "sonner";
import type { ResourceType } from "@/generated/prisma";
import { usePaginationParams } from "@/lib/pagination";
import { useTRPC } from "@/trpc/client";

export const useSuspenseIntegrations = (resourceType: ResourceType) => {
  const trpc = useTRPC();
  const [params] = usePaginationParams();
  // TODO: augment params to also include `asset`, right? for the `resourceType`

  return useSuspenseQuery(
    trpc.integrations.getManyIntegrations.queryOptions({
      ...params,
      ...{ resourceType },
    }),
  );
};

/**
 * Hook to create a new Integration
 */
export const useCreateIntegration = () => {
  const queryClient = useQueryClient();
  const trpc = useTRPC();

  return useMutation(
    trpc.integrations.createIntegration.mutationOptions({
      onSuccess: (data) => {
        toast.success("Integration created");
        queryClient.invalidateQueries(
          trpc.integrations.getManyIntegrations.queryOptions({
            resourceType: data.resourceType,
          }),
        );
        return data;
      },
      onError: (error) => {
        toast.error(`Failed to create Integration: ${error.message}`);
      },
    }),
  );
};

/**
 * Hook to update Integration
 */
export const useUpdateIntegration = () => {
  const queryClient = useQueryClient();
  const trpc = useTRPC();

  return useMutation(
    trpc.integrations.updateIntegration.mutationOptions({
      onSuccess: (data) => {
        toast.success("Integration updated");
        queryClient.invalidateQueries(
          trpc.integrations.getManyIntegrations.queryOptions({
            resourceType: data.resourceType,
          }),
        );
        return data;
      },
      onError: (error) => {
        toast.error(`Failed to update Integration: ${error.message}`);
      },
    }),
  );
};

/**
 * Hook to remove an Integration
 */
export const useRemoveIntegration = () => {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  return useMutation(
    trpc.integrations.removeIntegration.mutationOptions({
      onSuccess: (data) => {
        toast.success("Integration removed");
        // Invalidate all getMany and getOne queries regardless of params
        queryClient.invalidateQueries(
          trpc.integrations.getManyIntegrations.queryOptions({
            resourceType: data.resourceType,
          }),
        );
        return data;
      },
      onError: (error) => {
        toast.error(`Failed to remove Integration: ${error.message}`);
      },
    }),
  );
};
