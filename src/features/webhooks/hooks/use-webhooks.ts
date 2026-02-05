import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { toast } from "sonner";
import { useTRPC } from "@/trpc/client";

// List webhooks
export const useSuspenseWebhooks = () => {
  const trpc = useTRPC();

  return useSuspenseQuery(trpc.webhooks.getMany.queryOptions({}));
};

// Create one new Webhook
export const useCreateWebhook = () => {
  const queryClient = useQueryClient();
  const trpc = useTRPC();

  return useMutation(
    trpc.webhooks.create.mutationOptions({
      onSuccess: (data) => {
        toast.success("Webhook created");
        queryClient.invalidateQueries(trpc.webhooks.getMany.queryOptions({}));
        return data;
      },
      onError: (error) => {
        toast.error(`Failed to create Webhook: ${error.message}`);
        console.error(error);
      },
    }),
  );
};

// Update existing Webhook
export const useUpdateWebhook = () => {
  const queryClient = useQueryClient();
  const trpc = useTRPC();

  return useMutation(
    trpc.webhooks.update.mutationOptions({
      onSuccess: (data) => {
        toast.success("Webhook updated");
        queryClient.invalidateQueries(trpc.webhooks.getMany.queryOptions({}));
        return data;
      },
      onError: (error) => {
        toast.error(`Failed to update Webhook: ${error.message}`);
      },
    }),
  );
};

// Delete webhook
export const useRemoveWebhook = () => {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  return useMutation(
    trpc.webhooks.remove.mutationOptions({
      onSuccess: (data) => {
        toast.success("Webhook removed");
        queryClient.invalidateQueries(trpc.webhooks.getMany.queryOptions({}));
        return data;
      },
      onError: (error) => {
        toast.error(`Failed to remove Webhook: ${error.message}`);
      },
    }),
  );
};
