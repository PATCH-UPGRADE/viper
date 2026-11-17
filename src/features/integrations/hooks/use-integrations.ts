import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { toast } from "sonner";
import { INTEGRATIONS_POLL_INTERVAL_MS } from "@/config/constants";
import type { PlatformEnum } from "@/generated/prisma";
import { useTRPC } from "@/trpc/client";

// Every integration (getMany is unpaginated), so counts and filters see the whole set.
const useIntegrationsQueryOptions = () => {
  const trpc = useTRPC();

  return {
    ...trpc.integrations.getMany.queryOptions(),
    refetchInterval: INTEGRATIONS_POLL_INTERVAL_MS,
    refetchIntervalInBackground: true,
  };
};

export const useSuspenseIntegrations = () =>
  useSuspenseQuery(useIntegrationsQueryOptions());

/**
 * How many integrations each platform has. Structural sharing keeps the result stable, so this
 * re-renders only when a count changes, not on every sync-status poll.
 */
export const useAddedPlatformCounts = (): Partial<
  Record<PlatformEnum, number>
> =>
  useSuspenseQuery({
    ...useIntegrationsQueryOptions(),
    select: (data) => {
      const counts: Partial<Record<PlatformEnum, number>> = {};
      for (const { platform } of data) {
        counts[platform] = (counts[platform] ?? 0) + 1;
      }
      return counts;
    },
  }).data;

/** One platform's integrations, sorted by name. */
export const usePlatformIntegrations = (platform: PlatformEnum) =>
  useSuspenseQuery({
    ...useIntegrationsQueryOptions(),
    select: (data) =>
      data
        .filter((item) => item.platform === platform)
        .sort((a, b) => a.name.localeCompare(b.name)),
  }).data;

export const useSuspenseIntegrationSuggestions = () => {
  const trpc = useTRPC();
  return useSuspenseQuery(trpc.integrations.getSuggestions.queryOptions());
};

// The whole router, so the suggestions refresh too: a platform's suggestion can depend on which integrations exist.
const useInvalidateIntegrations = () => {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries(trpc.integrations.pathFilter());
};

export const useCreateIntegration = () => {
  const trpc = useTRPC();
  const invalidateIntegrations = useInvalidateIntegrations();

  return useMutation(
    trpc.integrations.create.mutationOptions({
      onSuccess: () => {
        toast.success("Integration created");
        invalidateIntegrations();
      },
      onError: (error) => {
        toast.error(`Failed to create Integration: ${error.message}`);
        console.error(error);
      },
    }),
  );
};

export const useUpdateIntegration = () => {
  const trpc = useTRPC();
  const invalidateIntegrations = useInvalidateIntegrations();

  return useMutation(
    trpc.integrations.update.mutationOptions({
      onSuccess: () => {
        toast.success("Integration updated");
        invalidateIntegrations();
      },
      onError: (error) => {
        toast.error(`Failed to update Integration: ${error.message}`);
        console.error(error);
      },
    }),
  );
};

export const useRemoveIntegration = () => {
  const trpc = useTRPC();
  const invalidateIntegrations = useInvalidateIntegrations();

  return useMutation(
    trpc.integrations.remove.mutationOptions({
      onSuccess: () => {
        toast.success("Integration removed");
        invalidateIntegrations();
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
