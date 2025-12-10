import { useTRPC } from "@/trpc/client";
import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { toast } from "sonner";
import { useAssetsParams } from "./use-assets-params";
import { AssetsVulnsInput } from "../server/routers";

/**
 * Hook to fetch all assets using suspense
 */
export const useSuspenseAssets = () => {
  const trpc = useTRPC();
  const [params] = useAssetsParams();

  return useSuspenseQuery(trpc.assets.getManyInternal.queryOptions(params));
};

/**
 * Hook to fetch all assets with matching vulnerabilities using suspense
 */
export const useSuspenseAssetsVulns = (params: AssetsVulnsInput) => {
  const trpc = useTRPC();

  return useSuspenseQuery(trpc.assets.getManyWithVulns.queryOptions(params));
};

/**
 * Hook to create a new asset
 */
export const useCreateAsset = () => {
  const queryClient = useQueryClient();
  const trpc = useTRPC();

  return useMutation(
    trpc.assets.create.mutationOptions({
      onSuccess: (data) => {
        toast.success(`Asset "${data.role}" created`);
        // Invalidate all getMany queries regardless of params (page, search, etc.)
        queryClient.invalidateQueries({
          predicate: (query) => {
            const baseKey = trpc.assets.getManyInternal.queryKey();
            return query.queryKey[0] === baseKey[0];
          },
        });
      },
      onError: (error) => {
        toast.error(`Failed to create asset: ${error.message}`);
      },
    }),
  );
};

/**
 * Hook to update an asset
 */
export const useUpdateAsset = () => {
  const queryClient = useQueryClient();
  const trpc = useTRPC();

  return useMutation(
    trpc.assets.update.mutationOptions({
      onSuccess: (data) => {
        toast.success(`Asset "${data.role}" updated`);
        // Invalidate all getMany and getOne queries regardless of params
        queryClient.invalidateQueries({
          predicate: (query) => {
            const getManyInternalKey = trpc.assets.getManyInternal.queryKey();
            const getOneKey = trpc.assets.getOne.queryKey();
            return (
              query.queryKey[0] === getManyInternalKey[0] ||
              query.queryKey[0] === getOneKey[0]
            );
          },
        });
      },
      onError: (error) => {
        toast.error(`Failed to update asset: ${error.message}`);
      },
    }),
  );
};

/**
 * Hook to remove an asset
 */
export const useRemoveAsset = () => {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  return useMutation(
    trpc.assets.remove.mutationOptions({
      onSuccess: (data) => {
        toast.success(`Asset "${data.role}" removed`);
        // Invalidate all getMany and getOne queries regardless of params
        queryClient.invalidateQueries({
          predicate: (query) => {
            const getManyInternalKey = trpc.assets.getManyInternal.queryKey();
            const getOneKey = trpc.assets.getOne.queryKey();
            return (
              query.queryKey[0] === getManyInternalKey[0] ||
              query.queryKey[0] === getOneKey[0]
            );
          },
        });
      },
      onError: (error) => {
        toast.error(`Failed to remove asset: ${error.message}`);
      },
    }),
  );
};

/**
 * Hook to fetch a single asset using suspense
 */
export const useSuspenseAsset = (id: string) => {
  const trpc = useTRPC();
  return useSuspenseQuery(trpc.assets.getOne.queryOptions({ id }));
};
