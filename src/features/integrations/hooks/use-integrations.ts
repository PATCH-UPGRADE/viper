import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { toast } from "sonner";
import { INTEGRATIONS_POLL_INTERVAL_MS, PAGINATION } from "@/config/constants";
import { usePaginationParams } from "@/lib/pagination";
import { useTRPC } from "@/trpc/client";

// The sidebar's per-category counts and filtering need every integration in
// hand, not just one page of them — a hospital's connector list is bounded
// (unlike assets/vulnerabilities), so fetching up to the max page size is
// effectively "all of them" and keeps the Overview pagination UI as a
// fallback for the rare case that isn't true.
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

export const useSetIntegrationEnabled = () => {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  return useMutation(
    trpc.integrations.setEnabled.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries(trpc.integrations.getMany.pathFilter());
      },
      onError: (error) => {
        toast.error(`Failed to enable/disable integration: ${error.message}`);
      },
    }),
  );
};

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
