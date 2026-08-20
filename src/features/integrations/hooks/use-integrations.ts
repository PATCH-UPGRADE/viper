import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { toast } from "sonner";
import { INTEGRATIONS_POLL_INTERVAL_MS, PAGINATION } from "@/config/constants";
import { usePaginationParams } from "@/lib/pagination";
import { useTRPC } from "@/trpc/client";

// Category counts/filtering need every integration, not one page of them —
// a hospital's connector list is bounded, so max page size is effectively "all".
export const useSuspenseIntegrations = () => {
  const trpc = useTRPC();
  const [params] = usePaginationParams();

  return useSuspenseQuery({
    ...trpc.integrations.getMany.queryOptions({
      ...params,
      pageSize: PAGINATION.MAX_PAGE_SIZE,
    }),
    refetchInterval: INTEGRATIONS_POLL_INTERVAL_MS,
    refetchIntervalInBackground: true,
  });
};

const useInvalidateIntegrations = () => {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  return () =>
    queryClient.invalidateQueries(trpc.integrations.getMany.pathFilter());
};

export const useCreateIntegration = () => {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const invalidateIntegrations = useInvalidateIntegrations();

  return useMutation(
    trpc.integrations.create.mutationOptions({
      onSuccess: () => {
        toast.success("Integration created");
        invalidateIntegrations();
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

export const useRemoveIntegration = () => {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const invalidateIntegrations = useInvalidateIntegrations();

  return useMutation(
    trpc.integrations.remove.mutationOptions({
      onSuccess: () => {
        toast.success("Integration removed");
        invalidateIntegrations();
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

export const useSetIntegrationEnabled = () => {
  const trpc = useTRPC();
  const invalidateIntegrations = useInvalidateIntegrations();

  return useMutation(
    trpc.integrations.setEnabled.mutationOptions({
      onSuccess: invalidateIntegrations,
      onError: (error) => {
        toast.error(`Failed to enable/disable integration: ${error.message}`);
      },
    }),
  );
};

export const useSetResourceSyncEnabled = () => {
  const trpc = useTRPC();
  const invalidateIntegrations = useInvalidateIntegrations();

  return useMutation(
    trpc.integrations.setResourceSyncEnabled.mutationOptions({
      onSuccess: invalidateIntegrations,
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
      onSuccess: () => {
        toast.success("Successfully triggered synchronization");
      },
      onError: (error) => {
        console.error(error);
        toast.error(`Failed to trigger synchronization`);
      },
    }),
  );
};
