import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { toast } from "sonner";
import { INTEGRATIONS_POLL_INTERVAL_MS } from "@/config/constants";
import { usePaginationParams } from "@/lib/pagination";
import { useTRPC } from "@/trpc/client";

export const useSuspenseIntegrations = () => {
  const trpc = useTRPC();
  const [params] = usePaginationParams();

  return useSuspenseQuery({
    ...trpc.integrations.getMany.queryOptions(params),
    refetchInterval: INTEGRATIONS_POLL_INTERVAL_MS,
    refetchIntervalInBackground: true,
  });
};

/**
 * Hook to create a new Integration
 */
export const useCreateIntegration = () => {
  const queryClient = useQueryClient();
  const trpc = useTRPC();

  return useMutation(
    trpc.integrations.create.mutationOptions({
      onSuccess: () => {
        toast.success("Integration created");
        queryClient.invalidateQueries(trpc.integrations.getMany.pathFilter());
        // Need to recount # of active ApiKey Connectors
        queryClient.invalidateQueries(
          trpc.apiKeyConnectors.getManyTypeCountInternal.queryOptions(),
        );
      },
      onError: (error) => {
        toast.error(`Failed to create Integration: ${error.message}`);
        console.error(error);
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
    trpc.integrations.update.mutationOptions({
      onSuccess: () => {
        toast.success("Integration updated");
        queryClient.invalidateQueries(trpc.integrations.getMany.pathFilter());
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
    trpc.integrations.remove.mutationOptions({
      onSuccess: () => {
        toast.success("Integration removed");
        queryClient.invalidateQueries(trpc.integrations.getMany.pathFilter());
        // Need to recount # of active ApiKey Connectors
        queryClient.invalidateQueries(
          trpc.apiKeyConnectors.getManyTypeCountInternal.queryOptions(),
        );
      },
      onError: (error) => {
        toast.error(`Failed to remove Integration: ${error.message}`);
      },
    }),
  );
};

/**
 * Operator kill switch for a whole integration.
 */
export const useSetIntegrationEnabled = () => {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  return useMutation(
    trpc.integrations.setEnabled.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries(trpc.integrations.getMany.pathFilter());
      },
      onError: (error) => {
        toast.error(`Failed to update Integration: ${error.message}`);
      },
    }),
  );
};

/**
 * Toggle one resource on a multi-resource integration (e.g. turn off work
 * orders, keep assets syncing).
 */
export const useSetResourceSyncEnabled = () => {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  return useMutation(
    trpc.integrations.setResourceSyncEnabled.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries(trpc.integrations.getMany.pathFilter());
      },
      onError: (error) => {
        toast.error(`Failed to update resource sync: ${error.message}`);
      },
    }),
  );
};

export const useTriggerSync = () => {
  const trpc = useTRPC();

  return useMutation(
    trpc.integrations.triggerSync.mutationOptions({
      onSuccess: (data) => {
        toast.success("Successfully triggered synchronization");
        return data;
      },
      onError: (error) => {
        console.error(error);
        toast.error(`Failed to trigger synchronization`);
      },
    }),
  );
};
