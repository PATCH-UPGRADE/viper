import { useTRPC } from "@/trpc/client"
import { useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { useAssetsParams } from "./use-assets-params";

/**
 * Hook to fetch all assets using suspense
 */
export const useSuspenseAssets = () => {
  const trpc = useTRPC();
  const [params] = useAssetsParams();

  return useSuspenseQuery(trpc.assets.getMany.queryOptions(params));
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
        queryClient.invalidateQueries(
          trpc.assets.getMany.queryOptions({}),
        );
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
        queryClient.invalidateQueries(
          trpc.assets.getMany.queryOptions({}),
        );
        queryClient.invalidateQueries(
          trpc.assets.getOne.queryOptions({ id: data.id }),
        );
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
        queryClient.invalidateQueries(trpc.assets.getMany.queryOptions({}));
        queryClient.invalidateQueries(
          trpc.assets.getOne.queryFilter({ id: data.id }),
        );
      },
      onError: (error) => {
        toast.error(`Failed to remove asset: ${error.message}`);
      },
    })
  )
}

/**
 * Hook to fetch a single asset using suspense
 */
export const useSuspenseAsset = (id: string) => {
  const trpc = useTRPC();
  return useSuspenseQuery(trpc.assets.getOne.queryOptions({ id }));
};
