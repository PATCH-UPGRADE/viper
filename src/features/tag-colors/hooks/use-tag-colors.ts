"use client";

import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { toast } from "sonner";
import { useTRPC } from "@/trpc/client";

export const useSuspenseCategoryColors = () => {
  const trpc = useTRPC();
  return useSuspenseQuery(trpc.tagColors.getCategoryColors.queryOptions());
};

export const useSetCategoryColor = () => {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  return useMutation(
    trpc.tagColors.setCategoryColor.mutationOptions({
      onSuccess: () => {
        toast.success("Category color updated");
        queryClient.invalidateQueries(
          trpc.tagColors.getCategoryColors.queryFilter(),
        );
        queryClient.invalidateQueries(trpc.tracking.getMany.queryFilter());
      },
      onError: (error) => {
        toast.error(`Failed to update color: ${error.message}`);
      },
    }),
  );
};
