import { useTRPC } from "@/trpc/client";
import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
  type QueryClient,
} from "@tanstack/react-query";
import { toast } from "sonner";
import { useEmulatorsParams } from "./use-emulators-params";

/**
 * Helper to invalidate emulator queries
 */
const invalidateEmulatorQueries = (
  queryClient: QueryClient,
  trpc: ReturnType<typeof useTRPC>,
  options: { includeGetOne?: boolean } = {},
) => {
  const { includeGetOne = false } = options;

  queryClient.invalidateQueries({
    predicate: (query) => {
      const getManyKey = trpc.emulators.getMany.queryKey();
      const isManyQuery = query.queryKey[0] === getManyKey[0];

      if (!includeGetOne) {
        return isManyQuery;
      }

      const getOneKey = trpc.emulators.getOne.queryKey();
      const isOneQuery = query.queryKey[0] === getOneKey[0];

      return isManyQuery || isOneQuery;
    },
  });
};

/**
 * Hook to fetch all emulators using suspense
 */
export const useSuspenseEmulators = () => {
  const trpc = useTRPC();
  const [params] = useEmulatorsParams();

  return useSuspenseQuery(trpc.emulators.getMany.queryOptions(params));
};

/**
 * Hook to create a new emulator
 */
export const useCreateEmulator = () => {
  const queryClient = useQueryClient();
  const trpc = useTRPC();

  return useMutation(
    trpc.emulators.create.mutationOptions({
      onSuccess: (data) => {
        toast.success(`Emulator "${data.role}" created`);
        invalidateEmulatorQueries(queryClient, trpc);
      },
      onError: (error) => {
        toast.error(`Failed to create emulator: ${error.message}`);
      },
    }),
  );
};

/**
 * Hook to update an emulator
 */
export const useUpdateEmulator = () => {
  const queryClient = useQueryClient();
  const trpc = useTRPC();

  return useMutation(
    trpc.emulators.update.mutationOptions({
      onSuccess: (data) => {
        toast.success(`Emulator "${data.role}" updated`);
        invalidateEmulatorQueries(queryClient, trpc, { includeGetOne: true });
      },
      onError: (error) => {
        toast.error(`Failed to update emulator: ${error.message}`);
      },
    }),
  );
};

/**
 * Hook to remove an emulator
 */
export const useRemoveEmulator = () => {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  return useMutation(
    trpc.emulators.remove.mutationOptions({
      onSuccess: (data) => {
        toast.success(`Emulator "${data.role}" removed`);
        invalidateEmulatorQueries(queryClient, trpc, { includeGetOne: true });
      },
      onError: (error) => {
        toast.error(`Failed to remove emulator: ${error.message}`);
      },
    }),
  );
};

/**
 * Hook to fetch a single emulator using suspense
 */
export const useSuspenseEmulator = (id: string) => {
  const trpc = useTRPC();
  return useSuspenseQuery(trpc.emulators.getOne.queryOptions({ id }));
};
