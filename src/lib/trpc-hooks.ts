"use client";

import { useMutation, useQueryClient, type UseMutationOptions } from "@tanstack/react-query";
import { toast } from "sonner";
import type { TRPCClientError } from "@trpc/client";

/**
 * Generic factory for create mutation hooks
 * Handles success toast, error toast, and query invalidation
 */
export function createMutationHook<TData, TVariables>(
  mutationFn: UseMutationOptions<TData, TRPCClientError<any>, TVariables>["mutationFn"],
  options: {
    getManyQueryKey: () => readonly unknown[];
    getOneQueryKey?: () => readonly unknown[];
    successMessage: (data: TData) => string;
    errorMessage?: string;
  },
) {
  return () => {
    const queryClient = useQueryClient();

    return useMutation<TData, TRPCClientError<any>, TVariables>({
      mutationFn,
      onSuccess: (data) => {
        toast.success(options.successMessage(data));

        // Invalidate all getMany queries regardless of params
        queryClient.invalidateQueries({
          predicate: (query) => {
            const getManyKey = options.getManyQueryKey();
            const getOneKey = options.getOneQueryKey?.();

            const matchesGetMany = query.queryKey[0] === getManyKey[0];
            const matchesGetOne = getOneKey ? query.queryKey[0] === getOneKey[0] : false;

            return matchesGetMany || matchesGetOne;
          },
        });
      },
      onError: (error) => {
        const message = options.errorMessage || `Operation failed: ${error.message}`;
        toast.error(message);
      },
    });
  };
}

/**
 * Creates invalidation helper for both getMany and getOne queries
 */
export function createQueryInvalidator(
  getManyQueryKey: () => readonly unknown[],
  getOneQueryKey?: () => readonly unknown[],
) {
  return (queryClient: ReturnType<typeof useQueryClient>) => {
    queryClient.invalidateQueries({
      predicate: (query) => {
        const getManyKey = getManyQueryKey();
        const getOneKey = getOneQueryKey?.();

        const matchesGetMany = query.queryKey[0] === getManyKey[0];
        const matchesGetOne = getOneKey ? query.queryKey[0] === getOneKey[0] : false;

        return matchesGetMany || matchesGetOne;
      },
    });
  };
}
