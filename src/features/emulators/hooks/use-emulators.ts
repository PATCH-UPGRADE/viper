import { useTRPC } from "@/trpc/client"
import { useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { useEmulatorsParams } from "./use-emulators-params";

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
        // Invalidate all getMany queries regardless of params (page, search, etc.)
        queryClient.invalidateQueries({
          predicate: (query) => {
            const baseKey = trpc.emulators.getMany.queryKey();
            return query.queryKey[0] === baseKey[0];
          },
        });
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
        // Invalidate all getMany and getOne queries regardless of params
        queryClient.invalidateQueries({
          predicate: (query) => {
            const getManyKey = trpc.emulators.getMany.queryKey();
            const getOneKey = trpc.emulators.getOne.queryKey();
            return query.queryKey[0] === getManyKey[0] || query.queryKey[0] === getOneKey[0];
          },
        });
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
        // Invalidate all getMany and getOne queries regardless of params
        queryClient.invalidateQueries({
          predicate: (query) => {
            const getManyKey = trpc.emulators.getMany.queryKey();
            const getOneKey = trpc.emulators.getOne.queryKey();
            return query.queryKey[0] === getManyKey[0] || query.queryKey[0] === getOneKey[0];
          },
        });
      },
      onError: (error) => {
        toast.error(`Failed to remove emulator: ${error.message}`);
      },
    })
  )
}

/**
 * Hook to fetch a single emulator using suspense
 */
export const useSuspenseEmulator = (id: string) => {
  const trpc = useTRPC();
  return useSuspenseQuery(trpc.emulators.getOne.queryOptions({ id }));
};
