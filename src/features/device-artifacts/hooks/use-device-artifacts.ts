import {
  type QueryClient,
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { toast } from "sonner";
import { useTRPC } from "@/trpc/client";
import { useDeviceArtifactsParams } from "./use-device-artifacts-params";

/**
 * Helper to invalidate DeviceArtifact queries
 */
const invalidateDeviceArtifactQueries = (
  queryClient: QueryClient,
  trpc: ReturnType<typeof useTRPC>,
  options: { includeGetOne?: boolean } = {},
) => {
  const { includeGetOne = false } = options;

  queryClient.invalidateQueries({
    predicate: (query) => {
      const getManyKey = trpc.deviceArtifacts.getMany.queryKey();
      const isManyQuery = query.queryKey[0] === getManyKey[0];

      if (!includeGetOne) {
        return isManyQuery;
      }

      const getOneKey = trpc.deviceArtifacts.getOne.queryKey();
      const isOneQuery = query.queryKey[0] === getOneKey[0];

      return isManyQuery || isOneQuery;
    },
  });
};

/**
 * Hook to fetch all deviceArtifacts using suspense
 */
export const useSuspenseDeviceArtifacts = () => {
  const trpc = useTRPC();
  const [params] = useDeviceArtifactsParams();

  return useSuspenseQuery(trpc.deviceArtifacts.getMany.queryOptions(params));
};

/**
 * Hook to create a new DeviceArtifact
 */
export const useCreateDeviceArtifact = () => {
  const queryClient = useQueryClient();
  const trpc = useTRPC();

  return useMutation(
    trpc.deviceArtifacts.create.mutationOptions({
      onSuccess: (data) => {
        toast.success(`DeviceArtifact "${data.role}" created`);
        invalidateDeviceArtifactQueries(queryClient, trpc);
      },
      onError: (error) => {
        toast.error(`Failed to create DeviceArtifact: ${error.message}`);
      },
    }),
  );
};

/**
 * Hook to update an DeviceArtifact
 */
export const useUpdateDeviceArtifact = () => {
  const queryClient = useQueryClient();
  const trpc = useTRPC();

  return useMutation(
    trpc.deviceArtifacts.update.mutationOptions({
      onSuccess: (data) => {
        toast.success(`DeviceArtifact "${data.role}" updated`);
        invalidateDeviceArtifactQueries(queryClient, trpc, {
          includeGetOne: true,
        });
      },
      onError: (error) => {
        toast.error(`Failed to update DeviceArtifact: ${error.message}`);
      },
    }),
  );
};

/**
 * Hook to remove an DeviceArtifact
 */
export const useRemoveDeviceArtifact = () => {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  return useMutation(
    trpc.deviceArtifacts.remove.mutationOptions({
      onSuccess: (data) => {
        toast.success(`DeviceArtifact "${data.role}" removed`);
        invalidateDeviceArtifactQueries(queryClient, trpc, {
          includeGetOne: true,
        });
      },
      onError: (error) => {
        toast.error(`Failed to remove DeviceArtifact: ${error.message}`);
      },
    }),
  );
};

/**
 * Hook to fetch a single DeviceArtifact using suspense
 */
export const useSuspenseDeviceArtifact = (id: string) => {
  const trpc = useTRPC();
  return useSuspenseQuery(trpc.deviceArtifacts.getOne.queryOptions({ id }));
};
